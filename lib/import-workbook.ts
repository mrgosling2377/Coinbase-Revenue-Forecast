import { unzipSync, strFromU8 } from 'fflate';
import { XMLParser } from 'fast-xml-parser';
import { data, calculate, scenarios } from './model.ts';
import type { ModelData, Scenario } from './model.ts';
import reference from '../verification/workbook-cells.json' with { type: 'json' };

type Cell = { value: string | number; formula?: string };
type Sheets = Record<string, Record<string, Cell>>;
export type SavedWorkbook = { data: ModelData; filename: string; uploadedAt: string; checks: number; warnings: string[] };
export const MAX_UPLOAD = 10 * 1024 * 1024;
const arr = <T,>(v: T | T[] | undefined): T[] => v === undefined ? [] : Array.isArray(v) ? v : [v];
// Parsed XML has a bounded schema but variable rich-text nodes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const text = (v: any): string => typeof v === 'string' || typeof v === 'number' ? String(v) : v ? text(v['#text'] ?? v.t ?? '') + arr(v.r).map((r: any) => text(r.t)).join('') : '';
const norm = (s:string) => s.replace(/^=/,'').replace(/\$/g,'').replace(/\s+/g,'').toUpperCase();

function readSheets(bytes: Uint8Array): Sheets {
  if(bytes.length > MAX_UPLOAD) throw new Error('Choose an .xlsx file smaller than 10 MB.');
  let expanded=0;
  const zip=unzipSync(bytes,{filter:file=>{
    const needed=/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(file.name);
    if(!needed)return false;
    expanded+=file.originalSize;
    if(expanded>20*1024*1024 || file.originalSize>8*1024*1024)throw new Error('This workbook is too large to process safely. Remove unused rows or sheets and try again.');
    return true;
  }});
  const parser=new XMLParser({ignoreAttributes:false,parseTagValue:false,parseAttributeValue:false,processEntities:true});
  const xml=(name:string)=>{if(!zip[name])throw new Error(`Missing workbook content: ${name}. Use an unencrypted .xlsx file.`);const s=strFromU8(zip[name]);if(/<!DOCTYPE|<!ENTITY/i.test(s))throw new Error('Unsupported XML declarations in workbook.');return parser.parse(s);};
  const shared=zip['xl/sharedStrings.xml']?arr(xml('xl/sharedStrings.xml').sst.si).map(text):[];
  const rels=arr(xml('xl/_rels/workbook.xml.rels').Relationships.Relationship) as Record<string,string>[];
  const definitions=arr(xml('xl/workbook.xml').workbook.sheets.sheet) as Record<string,string>[];
  const sheets:Sheets={};
  for(const definition of definitions){
    const name=definition['@_name'];
    // Notes/source sheets may be added; all worksheets are read for source links.
    const target=rels.find(r=>r['@_Id']===definition['@_r:id'])?.['@_Target'];
    if(!target)throw new Error(`Cannot read sheet ${name}.`);
    const path=target.startsWith('/')?target.slice(1):`xl/${target}`;
    if(!/^xl\/worksheets\/sheet\d+\.xml$/.test(path))throw new Error('Unsupported worksheet path.');
    const cells:Record<string,Cell>={};
    const sharedFormulas=new Map<string,{address:string;formula:string}>();
    const deferred:{address:string;id:string}[]=[];
    const rows=arr(xml(path).worksheet.sheetData?.row);
    let count=0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for(const row of rows as any[])for(const c of arr(row.c) as any[]){
      if(++count>15000)throw new Error('Too many cells. Use the Coinbase model workbook without unrelated data.');
      const address=c['@_r']; if(!address)continue;
      const type=c['@_t'];const raw=text(c.v);
      const value=type==='s'?shared[Number(raw)]??'':type==='inlineStr'?text(c.is):type==='str'||type==='e'?raw:raw!==''?Number(raw):'';
      cells[address]={value,...(c.f!==undefined?{formula:`=${text(c.f)}`}:{})};
      if(c.f?.['@_t']==='shared'){
        const id=String(c.f['@_si']);
        if(text(c.f))sharedFormulas.set(id,{address,formula:`=${text(c.f)}`});
        else deferred.push({address,id});
      }
    }
    const column=(s:string)=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
    const letters=(n:number):string=>n>0?letters(Math.floor((n-1)/26))+String.fromCharCode(65+(n-1)%26):'';
    for(const pending of deferred){
      const base=sharedFormulas.get(pending.id);if(!base)throw new Error('Incomplete shared formula in workbook.');
      const a=base.address.match(/^([A-Z]+)(\d+)$/)!,b=pending.address.match(/^([A-Z]+)(\d+)$/)!;
      const dc=column(b[1])-column(a[1]),dr=Number(b[2])-Number(a[2]);
      cells[pending.address].formula=base.formula.split(/("(?:[^"]|"")*")/).map((part,i)=>i%2?part:part.replace(/(\$?)([A-Z]{1,3})(\$?)(\d+)/g,(_,ac,c,ar,r)=>`${ac}${letters(column(c)+(ac?0:dc))}${ar}${Number(r)+(ar?0:dr)}`)).join('');
    }
    sheets[name]=cells;
  }
  return sheets;
}

// Small, non-eval arithmetic reader for the template's historical formulas.
// Recomputes from inputs so stale Excel formula caches cannot replace fresh data.
function evaluator(sheets:Sheets) {
  const memo=new Map<string,number>(),active=new Set<string>();
  function value(sheet:string,address:string,depth=0):number {
    const key=`${sheet}!${address}`;
    if(depth>80||active.has(key))throw new Error(`Circular or overly complex formula at ${key}.`);
    if(memo.has(key))return memo.get(key)!;
    const cell=sheets[sheet]?.[address];if(!cell)throw new Error(`Required cell ${key} is missing.`);
    active.add(key);
    let result:number;
    if(!cell.formula){if(typeof cell.value!=='number'||!Number.isFinite(cell.value))throw new Error(`${key} must contain a number.`);result=cell.value;}
    else {
      let expr=cell.formula.slice(1).replace(/\$/g,'');
      expr=expr.replace(/SUM\(([A-Z]+\d+):([A-Z]+\d+)\)/gi,(_,a,b)=>{
        const matchA=a.match(/^([A-Z]+)(\d+)$/i)!,matchB=b.match(/^([A-Z]+)(\d+)$/i)!;
        const col=(s:string)=>[...s.toUpperCase()].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
        const letters=(n:number):string=>n>0?letters(Math.floor((n-1)/26))+String.fromCharCode(65+(n-1)%26):'';
        const ca=col(matchA[1]),cb=col(matchB[1]),ra=+matchA[2],rb=+matchB[2];
        if(cb<ca||rb<ra||(cb-ca+1)*(rb-ra+1)>1000)throw new Error(`Unsupported SUM range at ${key}.`);
        let total=0;for(let c=ca;c<=cb;c++)for(let r=ra;r<=rb;r++)total+=value(sheet,letters(c)+r,depth+1);
        return `(${total})`;
      });
      expr=expr.replace(/(?:(?:'([^']+)'|([A-Za-z_][A-Za-z_ ]*))!)?([A-Z]+\d+)/g,(_,quoted,plain,address)=>`(${value(quoted??plain??sheet,address,depth+1)})`);
      let pos=0;
      const ws=()=>{while(/\s/.test(expr[pos]??'')&&pos<expr.length)pos++;};
      const atom=():number=>{ws();if(expr[pos]==='+'||expr[pos]==='-'){const sign=expr[pos++];return (sign==='-'?-1:1)*atom();}if(expr[pos]==='('){pos++;const n=add();ws();if(expr[pos++]!==')')throw new Error(`Invalid formula at ${key}.`);return n;}const m=expr.slice(pos).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);if(!m)throw new Error(`Unsupported formula at ${key}. Keep the model's original formula structure.`);pos+=m[0].length;return Number(m[0]);};
      const mul=():number=>{let n=atom();ws();while(expr[pos]==='*'||expr[pos]==='/'){const op=expr[pos++],r=atom();n=op==='*'?n*r:n/r;ws();}return n;};
      const add=():number=>{let n=mul();ws();while(expr[pos]==='+'||expr[pos]==='-'){const op=expr[pos++],r=mul();n=op==='+'?n+r:n-r;ws();}return n;};
      result=add();ws();if(pos!==expr.length)throw new Error(`Unsupported formula at ${key}.`);
    }
    if(!Number.isFinite(result))throw new Error(`Formula error or division by zero at ${key}.`);
    active.delete(key);memo.set(key,result);return result;
  }
  return value;
}

export function importWorkbook(bytes:Uint8Array,filename:string):SavedWorkbook {
  if(!/\.xlsx$/i.test(filename))throw new Error('Choose an Excel .xlsx workbook. CSV, .xls and macro-enabled files are not supported.');
  let sheets:Sheets;
  try{sheets=readSheets(bytes);}catch(e){throw new Error(e instanceof Error?e.message:'Could not open the workbook. Save an unencrypted .xlsx copy and try again.');}
  for(const name of ['Actuals','Drivers','Inputs','Driver Forecast','Revenue Forecast'])if(!sheets[name])throw new Error(`Missing sheet “${name}”. Upload an updated copy of the original Coinbase workbook.`);
  if(!/blockchain\s+rewards.*revenue.*growth/i.test(String(sheets.Inputs.B37?.value??'')))throw new Error('Use the final workbook template with Blockchain rewards revenue growth at Inputs!B37. Older price-only workbooks need their labels and notes updated first.');
  let checks=0;
  for(const sheet of ['Driver Forecast','Revenue Forecast','Inputs'] as const){
    for(const [address,cell] of Object.entries(reference[sheet])){
      const expected=cell.formula;
      if(typeof expected!=='string'||!expected.startsWith('=')||expected.startsWith('=HYPERLINK'))continue;
      const actual=sheets[sheet][address]?.formula;
      if(!actual||norm(actual)!==norm(expected))throw new Error(`The model formula at ${sheet}!${address} changed. This dashboard supports input updates in the original template; formula changes need a dashboard model update.`);
      checks++;
    }
  }
  const result=structuredClone(data);
  const number=evaluator(sheets);
  const rows={consumer:4,institutional:5,otherTransaction:6,transaction:7,stablecoin:10,rewards:11,finance:12,otherServices:13,services:14,net:16,corporate:19,total:22};
  const warnings:string[]=[];
  for(const [i,col] of [...'CDEFGH'].entries()){
    for(const sheet of ['Actuals','Drivers']){
      const expected=(reference as Record<string,Record<string,{formula:unknown}>>)[sheet][`${col}2`].formula;
      if(sheets[sheet][`${col}2`]?.value!==expected)throw new Error(`Quarter headers changed at ${sheet}!${col}2. This version supports Q1 2025 through Q4 2026.`);
    }
    const h=result.history[i];for(const [key,row] of Object.entries(rows))h[key as keyof typeof rows]=number('Actuals',`${col}${row}`);
    h.volume=number('Drivers',`${col}4`);h.usdc=number('Drivers',`${col}15`);
    if(h.volume<=0||h.usdc<=0)throw new Error(`Consumer volume and Coinbase USDC must be greater than zero in ${h.quarter}.`);
    const pairs=[[h.transaction,h.consumer+h.institutional+h.otherTransaction],[h.services,h.stablecoin+h.rewards+h.finance+h.otherServices],[h.net,h.transaction+h.services],[h.total,h.net+h.corporate]];
    for(const [a,b] of pairs){if(Math.abs(a-b)>.00001)throw new Error(`Revenue totals do not reconcile in ${h.quarter}. Check Actuals before uploading.`);checks++;}
  }
  result.institutionalVolume=number('Drivers','H5');if(result.institutionalVolume<=0)throw new Error('Institutional volume must be positive.');
  for(const definition of result.definitions)for(const s of scenarios)for(let q=0;q<2;q++){
    const row=definition.scenario?definition.caseRows![['Bull','Base','Bear'].indexOf(s)]:definition.row;
    const n=number('Inputs',`${q?'I':'H'}${row}`);
    result.defaults[s][q][definition.key as keyof typeof result.defaults.Bull[0]]=n;checks++;
  }
  const selected=number('Inputs','C7');if(![1,2,3].includes(selected))throw new Error('Inputs!C7 must be 1 (Best), 2 (Base), or 3 (Worst).');
  result.initialScenario=(['Bull','Base','Bear'] as Scenario[])[selected-1];
  result.sources=[];
  for(const [sheet,cells] of Object.entries(sheets))for(const [address,cell] of Object.entries(cells)){
    const match=cell.formula?.match(/^=HYPERLINK\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)$/i);if(!match)continue;
    const url=new URL(match[1]);if(!['https:','http:'].includes(url.protocol))throw new Error(`Unsupported source link in ${sheet}!${address}.`);
    const [,col,row]=address.match(/^([A-Z]+)(\d+)$/)!;const notes:string[]=[];
    for(let offset=1;offset<5;offset++){const c=cells[`${col}${Number(row)+offset}`];if(!c||c.formula||typeof c.value!=='string'||!c.value)break;notes.push(c.value);}
    result.sources.push({sheet,cell:address,url:match[1],title:match[2].replace(' (click to open)',''),notes});
  }
  if(!result.sources.length)throw new Error('No workbook source links were found. Preserve the HYPERLINK source notes in your workbook.');
  for(const s of ['Actuals','Drivers'] as const)result.notes[s]=Object.entries(sheets[s]).filter(([a,c])=>a.startsWith('B')&&typeof c.value==='string'&&/^\d+\./.test(c.value)).map(([,c])=>String(c.value));
  const rewardsNote=sheets.Drivers.B48?.value;
  if(typeof rewardsNote==='string'&&!result.notes.Drivers.includes(rewardsNote))result.notes.Drivers.push(rewardsNote);
  for(const s of scenarios){const f=calculate(result.defaults[s],result);if(f.some(r=>Object.values(r).some(v=>typeof v==='number'&&!Number.isFinite(v))))throw new Error(`${s} produces an invalid forecast.`);if(f.some(r=>r.takeRate<0||r.stableRate<0||r.volume<0||r.usdc<0))warnings.push(`${s} produces negative driver levels. Review its assumptions.`);}
  return {data:result,filename:filename.slice(0,180),uploadedAt:new Date().toISOString(),checks,warnings};
}
