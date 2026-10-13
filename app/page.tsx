'use client';

import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { BarChart3, Coins, Layers3, RotateCcw, Info, BookOpen, ChevronDown, SlidersHorizontal, TrendingDown, Target, TrendingUp, Upload, Loader2 } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { data as bundledData, calculate, original, scenarios, caseNames, updateInput, money, millions } from '@/lib/model';
import type { Scenario, Cases, ModelData } from '@/lib/model';

import type { SavedWorkbook } from '@/lib/import-workbook';
import { ModelExplanation } from '@/components/model-explanation';
import { ThemeToggle } from '@/components/theme-toggle';
import { AssumptionRationale } from '@/components/assumption-rationale';

const lines = [
  ['consumer', 'Consumer, net', 10], ['institutional', 'Institutional, net', 11], ['otherTransaction', 'Other transaction revenue', 12], ['transaction', 'Total transaction revenue', 13],
  ['stablecoin', 'Stablecoin revenue', 16], ['rewards', 'Blockchain rewards', 17], ['finance', 'Interest and finance fee income', 18], ['otherServices', 'Other subscription and services', 19], ['services', 'Total subscription and services', 20],
  ['net', 'Net revenue', 22], ['corporate', 'Corporate interest and other income', 25], ['total', 'Total revenue', 28],
] as const;
const hints: Record<string,string> = {
  volumeGrowth: 'Prior-quarter consumer spot volume × (1 + growth).',
  takeRateBps: 'Add bps ÷ 10,000 to the prior implied rate. This is a revenue-to-spot-volume ratio, not a quoted trading fee.',
  usdcGrowth: 'Prior-quarter average USDC in Coinbase products × (1 + growth).',
  stableRateBps: 'Add bps ÷ 10,000 to the prior effective quarterly revenue rate. Includes off-platform economics; not a reserve interest yield.',
  cryptoGrowth: 'Total blockchain rewards revenue grows at this rate, combining price, staking balances, network reward rates, and Coinbase’s retained share.',
};
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

function HistoryChart({ forecast, data }: { forecast: ReturnType<typeof calculate>; data: ModelData }) {
  const all = [...data.history, ...forecast];
  const upper = Math.max(0.5, ...all.map(d => Math.max(0, d.transaction) + Math.max(0, d.services))) / 1000000;
  const lower = Math.min(0, ...all.map(d => Math.min(0, d.transaction) + Math.min(0, d.services))) / 1000000;
  const max = Math.ceil(upper / .5) * .5;
  const min = Math.floor(lower / .5) * .5;
  const y = (v:number) => 264 - (v - min) / (max - min) * 219;
  const ticks = Array.from({length:6}, (_,i) => min + (max-min)*i/5);
  return <div className="chart-scroll"><svg className="history-chart" viewBox="0 0 1030 315" role="img" aria-label="Net revenue by quarter, Q1 2025 through Q4 2026. Dark blue is transaction revenue, light blue is subscription and services; outlined bars are forecasts.">
    <rect x="765" y="16" width="252" height="270" rx="9" fill="#f3f7ff" />
    <text x="891" y="33" textAnchor="middle" className="forecast-label">FORECAST</text>
    {ticks.map(v=><g key={v}><line x1="52" x2="1010" y1={y(v)} y2={y(v)} stroke="#e6ecf5"/><text x="39" y={y(v)+5} textAnchor="end" className="axis">{v.toFixed(1)}</text></g>)}
    {all.map((d,i)=>{
      const tx=d.transaction/1000000, ss=d.services/1000000;
      const txStart=0,txEnd=tx;
      const ssStart=(tx>=0)===(ss>=0)?tx:0,ssEnd=ssStart+ss;
      const x=75+i*119;
      const top=Math.max(0,txEnd,ssStart,ssEnd),bottom=Math.min(0,txEnd,ssStart,ssEnd);
      return <g key={d.quarter} tabIndex={0} className="chart-bar"><title>{`${d.quarter}${i>5?' forecast':''}: net ${money(d.net)}, transaction ${money(d.transaction)}, S&S ${money(d.services)}`}</title>
      <rect x={x} y={Math.min(y(txStart),y(txEnd))} width="74" height={Math.abs(y(txStart)-y(txEnd))} fill={i>5?'#4d83f7':'#1557cc'}/>
      <rect x={x} y={Math.min(y(ssStart),y(ssEnd))} width="74" height={Math.abs(y(ssStart)-y(ssEnd))} fill={i>5?'#bedcff':'#8cc1ff'}/>
      {i>5&&<rect x={x} y={y(top)} width="74" height={y(bottom)-y(top)} fill="none" stroke="#0052ff" strokeWidth="1.5" strokeDasharray="5 4"/>}
      <text x={x+37} y={y(top)-10} textAnchor="middle" className="bar-value">${(d.net/1000000).toFixed(3)}B</text>
      <text x={x+37} y="292" textAnchor="middle" className="axis">{d.quarter}</text></g>;
    })}
  </svg></div>;
}

export default function Dashboard() {
  const [data,setData]=useState<ModelData>(bundledData);
  const [workbook,setWorkbook]=useState<SavedWorkbook|null>(null);
  const loadingWorkbook=false;
  const [uploading,setUploading]=useState(false);
  const [uploadError,setUploadError]=useState('');
  const [uploadMessage,setUploadMessage]=useState('');
  const uploadRef=useRef<HTMLInputElement>(null);
  const [scenario,setScenario] = useState<Scenario>(bundledData.initialScenario as Scenario);
  const [quarter,setQuarter] = useState(0);
  const [activeTab,setActiveTab]=useState('overview');
  const [showAllInputs,setShowAllInputs]=useState(false);
  const [cases,setCases] = useState<Cases>(()=>original());
  const [resetMessage,setResetMessage]=useState('');
  const [drafts,setDrafts]=useState<Record<string,string>>({});
  const ref=useRef({cases,scenario,quarter,data});
  ref.current={cases,scenario,quarter,data};
  const allForecasts={Bear:calculate(cases.Bear,data),Base:calculate(cases.Base,data),Bull:calculate(cases.Bull,data)};
  const forecast=allForecasts[scenario];
  const result=forecast[quarter];
  const prior=quarter===0?data.history[5]:forecast[0];
  const modified=JSON.stringify(cases)!==JSON.stringify(data.defaults);
  const change=(key:string,q:number,raw:string)=>{
    setDrafts(d=>({...d,[`${scenario}-${key}-${q}`]:raw}));
    if(raw.trim()===''||!Number.isFinite(Number(raw)))return;
    const def=data.definitions.find(d=>d.key===key)!;
    setCases(c=>updateInput(c,scenario,q,key,Number(raw)/(def.unit==='%'?100:1)));
    setResetMessage('');
  };
  const reset=()=>{setCases(original(data));setScenario(data.initialScenario as Scenario);setQuarter(0);setDrafts({});setResetMessage('All assumptions restored from the active workbook.');};
  const applyWorkbook=(saved:SavedWorkbook)=>{setWorkbook(saved);setData(saved.data);setCases(original(saved.data));setScenario(saved.data.initialScenario as Scenario);setQuarter(0);setDrafts({});setResetMessage('');};
  const uploadWorkbook=async(file:File)=>{
    setUploadError('');setUploadMessage('');
    if(!/\.xlsx$/i.test(file.name)||file.size>10*1024*1024){setUploadError('Choose an Excel .xlsx workbook smaller than 10 MB.');return;}
    setUploading(true);
    try{const {importWorkbook}=await import('@/lib/import-workbook');const saved=importWorkbook(new Uint8Array(await file.arrayBuffer()),file.name);applyWorkbook(saved);setUploadMessage(`Loaded ${file.name} in this tab only. All three scenarios now use this workbook. ${saved.checks} template and data checks passed.`);}catch(e){const message=e instanceof Error?e.message:'Upload failed.';setUploadError(/invalid zip data/i.test(message)?'This file is not a valid Excel .xlsx workbook. Your dashboard is unchanged.':message);}finally{setUploading(false);if(uploadRef.current)uploadRef.current.value='';}
  };
  useEffect(()=>{
    const context=(document as Document & {modelContext?:{registerTool:(t:unknown,o:unknown)=>Promise<void>|void}}).modelContext;
    if(!context?.registerTool)return;
    const controller=new AbortController();
    const tool={name:'configure_revenue_forecast',title:'Configure revenue forecast',description:'Set the dashboard scenario or quarter and batch-edit assumptions. Percentage inputs use percentage points (10 means 10%); rate changes use bps. Shared growth assumptions update all cases. reset restores the workbook.',inputSchema:{type:'object',properties:{scenario:{type:'string',enum:scenarios},quarter:{type:'integer',enum:[3,4]},reset:{type:'boolean'},changes:{type:'array',items:{type:'object',properties:{key:{type:'string',enum:data.definitions.map(d=>d.key)},quarter:{type:'integer',enum:[3,4]},value:{type:'number'}},required:['key','quarter','value'],additionalProperties:false}}},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:(input:unknown)=>{
      if(!input||typeof input!=='object')throw new Error('Expected an object.');
      const p=input as {scenario?:Scenario;quarter?:number;reset?:boolean;changes?:{key:string;quarter:number;value:number}[]};
      if(Object.keys(p).some(k=>!['scenario','quarter','reset','changes'].includes(k)))throw new Error('Unknown field.');
      if(p.scenario!==undefined&&!scenarios.includes(p.scenario))throw new Error('Invalid scenario.');
      if(p.quarter!==undefined&&![3,4].includes(p.quarter))throw new Error('Invalid quarter.');
      if(p.reset!==undefined&&typeof p.reset!=='boolean')throw new Error('Invalid reset.');
      if(p.changes!==undefined&&!Array.isArray(p.changes))throw new Error('Changes must be an array.');
      const s=p.scenario??(p.reset?ref.current.data.initialScenario as Scenario:ref.current.scenario),q=p.quarter!==undefined?p.quarter-3:p.reset?0:ref.current.quarter;
      let c=p.reset?original(ref.current.data):structuredClone(ref.current.cases);
      for(const a of p.changes??[]){const d=data.definitions.find(d=>d.key===a.key);if(!d||![3,4].includes(a.quarter)||!Number.isFinite(a.value))throw new Error('Invalid assumption.');c=updateInput(c,s,a.quarter-3,a.key,a.value/(d.unit==='%'?100:1));}
      flushSync(()=>{setCases(c);setScenario(s);setQuarter(q);setDrafts({});});
      return {scenario:s,quarter:q+3,unit:'USD thousands',outputs:calculate(c[s],ref.current.data)[q]};
    }};
    try{Promise.resolve(context.registerTool(tool,{signal:controller.signal})).catch(()=>{});}catch{}
    return()=>controller.abort();
  },[]);
  const resetOne=(key:string,q:number)=>{setCases(c=>updateInput(c,scenario,q,key,data.defaults[scenario][q][key as keyof typeof data.defaults.Bull[0]]));setDrafts({});setResetMessage(`Q${q+3} input restored from the workbook.`);};
  const revenueDescriptions:Record<string,string>={consumer:'Revenue from individual customers trading crypto and related consumer transaction activity.',institutional:'Transaction revenue from institutions; the model grows this directly rather than forecasting each product.',otherTransaction:'Other transaction-related revenue reported separately from consumer and institutional activity.',transaction:'Consumer + institutional + other transaction revenue.',stablecoin:'Revenue associated with USDC balances and Coinbase’s stablecoin economics.',rewards:'Blockchain staking rewards: revenue connected to helping networks validate transactions.',finance:'Interest and fees from financing activities.',otherServices:'Other subscription and service income, including the category affected by the pending earn-out adjustment.',services:'Stablecoins + blockchain rewards + finance fees + other services.',net:'Transaction revenue + subscription and services. This is revenue, not profit.',corporate:'Corporate interest and other income, outside the net revenue subtotal.',total:'Net revenue + corporate interest and other income. Expenses are not deducted.'};
  const movers=lines.filter(([key])=>!['transaction','services','net','total','corporate'].includes(key)).map(([key,label])=>({label,delta:result[key]-prior[key]})).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
  const share=result.net!==0?result.transaction/result.net:0;
  const validMix=result.net>0&&result.transaction>=0&&result.services>=0;
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand">coinbase</div>
      <div className="heading"><h1>Coinbase Revenue Forecast</h1><p>Independent student project <span>·</span> Provisional forecast assumptions</p></div>
      <div className="top-controls">
        <ThemeToggle/>
        <RadioGroup aria-label="Scenario" value={scenario} onValueChange={v=>{setScenario(v as Scenario);setDrafts({});}} className="scenario-switch">
          {scenarios.map(s=><label key={s} className={`scenario-option ${scenario===s?'selected':''}`}><RadioGroupItem value={s} aria-label={s} className="scenario-radio"/><span>{s}</span></label>)}
        </RadioGroup>
        <Select value={String(quarter)} onValueChange={v=>setQuarter(Number(v))}><SelectTrigger aria-label="Forecast quarter" className="quarter-select"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="0">Q3 2026</SelectItem><SelectItem value="1">Q4 2026</SelectItem></SelectContent></Select>
      </div>
    </header>

    <section className="workbook-bar" aria-label="Workbook upload">
      <div><strong>Active workbook</strong><span>{workbook?.filename??'Coinbase VERSION FINAL.xlsx'}</span><small>{workbook?`Loaded ${new Date(workbook.uploadedAt).toLocaleString()}`:'Final workbook default'} · Browser-only Excel updates</small></div>
      <div className="upload-action"><input ref={uploadRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Upload updated Excel workbook" disabled={uploading||loadingWorkbook} onChange={e=>{const file=e.target.files?.[0];if(file)void uploadWorkbook(file);}} className="file-picker"/><button className="upload-button" disabled={uploading||loadingWorkbook} onClick={()=>uploadRef.current?.click()}>{uploading?<Loader2 className="spin" size={17}/>:<Upload size={17}/>} {uploading?'Validating…':'Upload updated Excel'}</button></div>
      <p className="upload-help">Save your edits in Excel, then select the .xlsx copy. Preserve the final template’s sheets, cell layout, units, formulas and rewards revenue-growth label. Files are processed in this browser tab and are not sent to a server. Refreshing restores the built-in workbook; reset restores the active workbook’s assumptions.</p>
      {uploadError&&<p role="alert" className="upload-error">{uploadError}</p>}{uploadMessage&&<p role="status" className="upload-success">{uploadMessage}</p>}{workbook?.warnings.map(w=><p className="upload-error" key={w}>{w}</p>)}
    </section>
    <nav className="dashboard-tabs" aria-label="Dashboard sections" role="tablist">{[['overview','Overview'],['details','Revenue Details'],['assumptions','Assumptions & Rationale'],['methodology','Methodology & Sources']].map(([id,label],i,items)=><button key={id} id={`tab-${id}`} role="tab" aria-selected={activeTab===id} aria-controls={`panel-${id}`} tabIndex={activeTab===id?0:-1} onClick={()=>setActiveTab(id)} onKeyDown={e=>{let next=i;if(e.key==='ArrowRight')next=(i+1)%items.length;else if(e.key==='ArrowLeft')next=(i+items.length-1)%items.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=items.length-1;else return;e.preventDefault();setActiveTab(items[next][0]);document.getElementById(`tab-${items[next][0]}`)?.focus();}}>{label}</button>)}</nav>
    <main id={`panel-${activeTab}`} role="tabpanel" aria-labelledby={`tab-${activeTab}`} className={`dashboard-grid tab-layout tab-${activeTab}`}>
      {activeTab==='overview'&&<>
      <aside className="panel assumptions"><div className="section-title"><h2><SlidersHorizontal size={19}/> Forecast assumptions</h2><Info size={16} aria-label="Changes apply immediately"/></div>
        <div className="assumption-context"><span className="case-label">{scenario} <span>/ {caseNames[scenario]}</span></span><span className={`status-label ${modified?'modified':''}`}>{modified?'Edited inputs':'Workbook defaults'}</span></div>
        <p className="muted intro">Quarter-over-quarter changes. Q4 builds on forecast Q3.</p>
        <div className="input-column-head"><span>Scenario drivers</span><span>Q3 2026</span><span>Q4 2026</span></div>
        <div className="assumption-fields" id="model-input-fields">
          {data.definitions.filter(d=>showAllInputs||d.scenario).map((d,i)=><div key={d.key}>
            {i===5&&<div className="shared-heading"><h3>Other revenue growth</h3><p>Shared across Bear, Base and Bull.</p></div>}
            <div className="assumption-field"><div className="input-label"><label htmlFor={`${d.key}-0`}>{d.label} <span>({d.unit})</span></label><span className="help" title={hints[d.key]??'Prior-quarter revenue × (1 + growth). Same input applies to every scenario.'}><Info size={14}/></span></div>
              <div className="input-pair">{[0,1].map(q=>{
                const id=`${scenario}-${d.key}-${q}`;
                const sourceRow=d.scenario?d.caseRows![['Bull','Base','Bear'].indexOf(scenario)]:d.row;
                const edited=cases[scenario][q][d.key]!==data.defaults[scenario][q][d.key as keyof typeof data.defaults.Bull[0]];
                return <div className={`input-box ${quarter===q?'active-quarter':''} ${edited?'edited':''}`} key={q}><input id={`${d.key}-${q}`} aria-label={`${d.label} Q${q+3} ${d.unit}`} type="number" step={d.unit==='bps'?'1':'0.1'} value={drafts[id]??Number((cases[scenario][q][d.key]*(d.unit==='%'?100:1)).toFixed(8))} onChange={e=>change(d.key,q,e.target.value)} onBlur={()=>setDrafts(draft=>{const next={...draft};delete next[id];return next;})} title={`Inputs!${q===0?'H':'I'}${sourceRow}`} /><span>{d.unit}</span>{edited&&<button type="button" className="reset-one" onClick={()=>resetOne(d.key,q)} aria-label={`Reset ${d.label} Q${q+3}`} title="Restore this input from workbook"><RotateCcw size={13}/></button>}</div>;
              })}</div></div>
          </div>)}
        </div>
        <p className="muted tiny">1 bp = 0.01 percentage points. Blank entries retain the last valid value.</p>
        <button className="reset-button" onClick={reset}><RotateCcw size={16}/> Reset to workbook</button>
        <p role="status" className="reset-status">{resetMessage}</p>
        <button className="all-inputs-toggle" aria-expanded={showAllInputs} aria-controls="model-input-fields" onClick={()=>setShowAllInputs(v=>!v)}>{showAllInputs?'Hide additional inputs':'All model inputs'} <ChevronDown size={16}/></button>
        {activeTab==='overview'&&<button className="text-button" onClick={()=>setActiveTab('assumptions')}>Read assumption reasoning</button>}
      </aside>
      </>}
      {activeTab==='assumptions'&&<div className="main-content"><section className="panel learning-panel"><h2>Active model inputs</h2><p>An assumption is a value chosen for something we do not yet know. A scenario is a consistent set of assumptions—not a probability or a promise.</p><p>Edit inputs on Overview. The first five drivers vary by Bear, Base, and Bull; select “All model inputs” there to reveal the five growth inputs shared by every case. Highlighted edits differ from the uploaded workbook, and individual reset buttons restore one quarter at a time.</p><p>Enter 10 for 10% growth, or 2 for a 2-basis-point rate increase. Q3 changes can affect both forecast quarters because Q4 starts from Q3. A 0% growth input keeps a revenue line flat; it does not set revenue to zero.</p></section><AssumptionRationale/></div>}
      {activeTab==='overview'&&<div className="main-content">
        <div className="summary-grid" aria-live="polite">
          {[{label:'Projected net revenue',key:'net',icon:BarChart3},{label:'Transaction revenue',key:'transaction',icon:Coins},{label:'Subscription & services',key:'services',icon:Layers3}].map(({label,key,icon:Icon})=>{
            const value=result[key as 'net'|'transaction'|'services'];const old=prior[key as 'net'|'transaction'|'services'];
            return <section className="panel summary-card" key={key}><div className="metric-icon"><Icon size={25}/></div><div><p className="metric-label">{label}</p><div className="metric-value" data-testid={`metric-${key}`}>{money(value)}</div><p className="metric-detail">{old!==0?`${value>=old?'+':''}${((value/old-1)*100).toFixed(1)}% QoQ`:'QoQ not available'} <span>· Q{quarter+3} 2026</span></p></div></section>;
          })}
        </div>

        <section className="panel learning-panel"><h2>What drives this forecast?</h2><p>Q{quarter+3} net revenue {result.net>=prior.net?'increases':'decreases'} by {money(Math.abs(result.net-prior.net))} versus {quarter===0?'Q2 actuals':'forecast Q3'}. The largest individual movement is {movers[0].label.toLowerCase()}, {movers[0].delta>=0?'up':'down'} {money(Math.abs(movers[0].delta))}.</p><p className="muted">QoQ means quarter over quarter. Bear and Bull show alternative assumptions around Base; they are not statistical confidence limits. Corporate income is excluded from these net-revenue cards.</p></section>
        <section className="panel chart-panel"><div className="section-title"><div><h2>Historical revenue & forecast</h2><p className="muted">Net revenue · {scenario} scenario</p></div><span className="muted">USD billions</span></div>
          <HistoryChart forecast={forecast} data={data}/>
          <div className="legend"><span><i className="dot transaction"/> Transaction revenue</span><span><i className="dot services"/> Subscription & services</span><span><i className="forecast-key"/> Forecast</span></div>
          <p className="chart-note">2025 and 2026 revenue categories use different classifications. <button className="text-button" onClick={()=>setActiveTab('methodology')}>See model notes</button>.</p>
        </section>

        <div className="comparison-row">
          <section className="panel comparison-panel"><div className="section-title"><h2>Scenario comparison</h2><span className="muted">Q{quarter+3} net revenue</span></div>
            <div className="scenario-cards">{scenarios.map((s,i)=>{const Icons=[TrendingDown,Target,TrendingUp];const Icon=Icons[i];const net=allForecasts[s][quarter].net;const base=allForecasts.Base[quarter].net;return <button key={s} aria-label={`Select ${s} scenario`} aria-pressed={scenario===s} className={`case-card case-${s.toLowerCase()} ${scenario===s?'active':''}`} onClick={()=>{setScenario(s);setDrafts({});}}><div className="case-card-title"><Icon size={20}/>{s}</div><strong>{money(net)}</strong><span>{caseNames[s]}</span>{s!=='Base'&&<span>{net>=base?'+':'−'}{money(Math.abs(net-base))} vs. base</span>}<small>{s==='Base'?'Comparison baseline':base!==0?`${net>=base?'+':''}${((net/base-1)*100).toFixed(1)}% vs. base`:'Base comparison unavailable'}</small></button>;})}</div>
          </section>
          <section className="panel mix-panel"><div className="section-title"><h2>Revenue mix</h2><span className="muted">Q{quarter+3} forecast</span></div><div className="mix-body">
            <div className="donut" role="img" aria-label={validMix?`Transaction ${pct(share)}, subscription and services ${pct(1-share)}`:'Revenue mix unavailable for zero or negative components'} style={{background:validMix?`conic-gradient(#1557cc 0 ${share*100}%, #8cc1ff ${share*100}% 100%)`:'#e9eef5'}}><div><strong>{money(result.net)}</strong><span>net revenue</span></div></div>
            <div className="mix-legend"><div><i className="dot transaction"/><strong>{validMix?`${(share*100).toFixed(1)}%`:'—'}</strong><span>Transaction</span><b>{money(result.transaction)}</b></div><div><i className="dot services"/><strong>{validMix?`${((1-share)*100).toFixed(1)}%`:'—'}</strong><span>Subscription & services</span><b>{money(result.services)}</b></div></div>
          </div></section>
        </div>

      </div>}
      {activeTab==='details'&&<div className="main-content details-content">
        <section className="panel learning-panel"><h2>Read the revenue build</h2><p>Revenue is money earned before expenses. Net revenue here combines transactions with subscriptions and services; total revenue adds corporate interest and other income. Neither measure is net income or profit.</p><p>Figures below are in millions of dollars. Each forecast cell shows the change from the preceding quarter; Q4 compares with forecast Q3. Expand a revenue label for its meaning.</p></section>
        <section className="panel breakdown"><div className="section-title"><div><h2>Detailed revenue breakdown</h2><p className="muted">{scenario} / {caseNames[scenario]} · USD millions, three decimals</p></div><span className="tag">Q4 rolls from Q3</span></div>
          <Table><TableHeader><TableRow><TableHead>Revenue line</TableHead><TableHead className="numeric">Q2 2026 actual</TableHead><TableHead className={`numeric ${quarter===0?'selected-col':''}`}>Q3 2026 forecast</TableHead><TableHead className={`numeric ${quarter===1?'selected-col':''}`}>Q4 2026 forecast</TableHead></TableRow></TableHeader><TableBody>
            {lines.map(([key,label,row])=><TableRow key={key} className={['transaction','services','net','total'].includes(key)?`subtotal ${key}`:''}><TableCell><details className="revenue-definition"><summary>{label}</summary><p>{revenueDescriptions[key]}</p></details><small className="cell-reference">Revenue Forecast!E{row}:F{row}</small></TableCell><TableCell className="numeric">{millions(data.history[5][key])}</TableCell>{forecast.map((r,q)=><TableCell key={q} className={`numeric ${quarter===q?'selected-col':''}`} data-testid={`${key}-q${q+3}`}>{millions(r[key])}<small className="revenue-change">{r[key]-(q===0?data.history[5][key]:forecast[0][key])>=0?'+':''}{millions(r[key]-(q===0?data.history[5][key]:forecast[0][key]))}M · {(q===0?data.history[5][key]:forecast[0][key])>0?`${((r[key]/(q===0?data.history[5][key]:forecast[0][key])-1)*100).toFixed(1)}%`:'% not meaningful'}</small></TableCell>)}</TableRow>)}
          </TableBody></Table>
          <div className="table-footnote"><strong>Net revenue</strong> = transaction + subscription & services. <strong>Total revenue</strong> adds corporate interest and other income.</div>
        </section>

        <section className="panel drivers-panel"><div className="section-title"><h2>Forecast driver levels</h2><span className="muted">Calculated from your inputs</span></div><div className="driver-levels">
          <div><span>Consumer spot volume</span><strong>${result.volume.toFixed(3)}B</strong></div><div><span>Consumer implied take rate</span><strong>{pct(result.takeRate)}</strong></div><div><span>Average Coinbase USDC</span><strong>${result.usdc.toFixed(3)}B</strong></div><div><span>Effective quarterly stablecoin rate</span><strong>{pct(result.stableRate)}</strong></div>
        </div><p className="muted tiny">Institutional spot volume stays at ${data.institutionalVolume}B. Total USDC market cap is context only and does not feed this forecast.</p></section>
        <details className="panel detail-calculations"><summary>See how driver levels turn into revenue</summary><ModelExplanation data={data} scenario={scenario} inputs={cases[scenario]} quarter={quarter}/></details>
      </div>}


    {activeTab==='methodology'&&<section className="model-section" id="model-notes"><div className="section-title"><h2><BookOpen size={20}/> Sources & model explanations</h2><span className="muted">{workbook?.filename??'Coinbase VERSION FINAL.xlsx'}</span></div>
      <section className="learning-panel"><h3>A short guide to the model</h3><p><strong>Driver:</strong> an activity or balance that helps explain revenue, such as trading volume. <strong>Take rate:</strong> revenue divided by trading volume. <strong>Effective rate:</strong> an observed revenue-to-balance ratio that can combine several economic effects.</p><p><strong>Quarterly average:</strong> the balance held across the quarter, rather than only on its last day. <strong>Basis point:</strong> 0.01 percentage points; a 2-bp increase takes 1.75% to 1.77%. <strong>Compounding:</strong> applying each quarter’s growth to the previous quarter’s new level.</p><p>The model uses operating drivers where the workbook provides them and simple revenue growth elsewhere. This makes assumptions transparent, but it does not capture every product, customer, or market effect. Expenses, EBITDA, profit and share-price valuation are outside this revenue forecast.</p></section>
      <div className="notices"><div><strong>Provisional assumptions</strong><p>The Q3 performance earn-out roll-off is not yet modeled separately. The final workbook uses provisional analyst assumptions, including a net decline in other S&S. The earn-out amount has not been isolated; do not subtract it again without removing the amount already reflected in that decline.</p></div><div><strong>2025–2026 classification difference</strong><p>2025 keeps corporate USDC income in stablecoin revenue. 2026 places it in corporate interest and other income. Stablecoin, S&S, net and corporate revenue are not fully comparable. Total revenue is unaffected.</p></div></div>
      <ModelExplanation data={data} scenario={scenario} inputs={cases[scenario]} quarter={quarter}/>

      <details><summary>Workbook sources and exact locations <ChevronDown size={17}/></summary><div className="sources-grid">{data.sources.map(s=><article key={`${s.sheet}-${s.cell}`}><span className="source-cell">{s.sheet}!{s.cell}</span><h3><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></h3>{s.notes.map(n=><p key={n}>{n}</p>)}</article>)}</div><p className="muted source-footer">Links and location notes are reproduced from the workbook. Source documents were not independently re-audited or refreshed.</p></details>
      <details><summary>Final workbook default notes <ChevronDown size={17}/></summary><div className="method-grid">{Object.entries(data.notes).map(([sheet,notes])=><div key={sheet}><h3>{sheet}</h3>{notes.map(n=><p key={n}>{n}</p>)}</div>)}</div></details>
      <details><summary>Calculation verification & limitations <ChevronDown size={17}/></summary><div className="verification-copy"><p>Bear maps to Worst Case (3), Base to Base Case (2), and Bull to Best Case (1). Reset follows the active workbook’s scenario selector and restores all of its assumptions.</p><p>The final workbook’s scenario outputs were compared with recalculated workbook formulas for all three cases and both forecast quarters. Its saved Base Case results were also checked against available Excel cached values. A Base Case test changed Q3 consumer volume growth to 10% and checked the resulting Q3 and Q4 revenue. Verification uses a spreadsheet calculation engine, not the Microsoft Excel application.</p><p>Uploaded workbook data stays in this browser tab and is never sent to a server. Refreshing restores the built-in workbook. On-screen assumption experiments live in this page session. Reset restores every scenario and both quarters from the active workbook. New uploads are checked for the supported formula structure and internally consistent historical totals; this is not an independent audit of their source data. The model preserves the final workbook’s formulas and shared-input structure. Earlier price-only templates are not supported.</p></div></details>
    </section>}
    </main>
    <footer><span>Independent student project · AI-assisted development</span><span>Not affiliated with Coinbase. Forecasts are provisional.</span></footer>
  </div>;
}
