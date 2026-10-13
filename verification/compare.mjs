import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {calculate,original,updateInput,data,scenarios} from '../lib/model.ts';
const expected=JSON.parse(await fs.readFile(new URL('./recalculated-workbook.json',import.meta.url),'utf8'));
const cells=JSON.parse(await fs.readFile(new URL('./workbook-cells.json',import.meta.url),'utf8'));
const rows={consumer:10,institutional:11,otherTransaction:12,transaction:13,stablecoin:16,rewards:17,finance:18,otherServices:19,services:20,net:22,corporate:25,total:28};
const driverRows={volume:11,takeRate:17,usdc:22,stableRate:25};
let count=0,maxDifference=0;
const check=(actual,ref,label)=>{assert.equal(typeof ref,'number',label+' numeric workbook output');const delta=Math.abs(actual-ref);maxDifference=Math.max(maxDifference,delta);assert.ok(delta<1e-7,`${label}: ${actual} != ${ref}`);count++;};
const reports=[];
for(const s of scenarios){const outputs=calculate(original()[s]);for(let q=0;q<2;q++){
 for(const [k,row] of Object.entries(rows)){check(outputs[q][k],expected[s].revenue[row-10][q],`${s} Q${q+3} ${k}`);if(s==='Base'&&typeof cells['Revenue Forecast'][`${q===0?'E':'F'}${row}`].cached==='number')check(outputs[q][k],cells['Revenue Forecast'][`${q===0?'E':'F'}${row}`].cached,`Saved Excel ${k}`);}
 for(const [k,row] of Object.entries(driverRows))check(outputs[q][k],expected[s].drivers[row-11][q],`${s} driver ${k}`);
 reports.push({scenario:s,quarter:q+3,transaction:outputs[q].transaction,services:outputs[q].services,net:outputs[q].net,corporate:outputs[q].corporate,total:outputs[q].total});
}}
const edited=updateInput(original(),'Base',0,'volumeGrowth',.1);
const changed=calculate(edited.Base);
for(let q=0;q<2;q++)for(const [k,row] of Object.entries(rows))check(changed[q][k],expected.editedBase.revenue[row-10][q],`Edited Base Q${q+3} ${k}`);
assert.equal(edited.Bull[0].volumeGrowth,data.defaults.Bull[0].volumeGrowth);
const shared=updateInput(original(),'Base',0,'corporateGrowth',.1);
for(const s of scenarios){assert.equal(shared[s][0].corporateGrowth,.1);assert.equal(calculate(shared[s])[0].net,calculate(original()[s])[0].net);}
for(let i=0;i<data.history.length;i++){let d=data.history[i];check(d.consumer+d.institutional+d.otherTransaction,d.transaction,`History ${i} transactions`);check(d.stablecoin+d.rewards+d.finance+d.otherServices,d.services,`History ${i} services`);check(d.transaction+d.services,d.net,`History ${i} net`);check(d.net+d.corporate,d.total,`History ${i} total`);}
const report={status:'passed',comparisons:count,maxAbsoluteDifferenceInThousands:maxDifference,method:'Recalculation of the imported Excel workbook using Artifact Tool, comparison to the independently implemented site model, and comparison to available saved Excel Base Case cached outputs. Microsoft Excel itself was not available.',reports,editedBase:changed.map(({net,total,transaction,services})=>({net,total,transaction,services})),sharedInputTest:'Corporate growth applies to all cases and leaves net revenue unchanged.'};
await fs.writeFile(new URL('./verification-report.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
