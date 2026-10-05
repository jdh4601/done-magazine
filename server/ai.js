import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {run} from './process.js';

export function normalizeProvider(value='codex') {
  if(!['codex','claude'].includes(value))throw new Error('Codex 또는 Claude CLI를 선택하세요.');
  return value;
}
export const providerName=provider=>provider==='claude'?'Claude':'Codex';
export async function cliBinary(provider) {
  normalizeProvider(provider);
  const configured=process.env[provider==='claude'?'CLAUDE_BIN':'CODEX_BIN'];
  if(configured)return configured;
  const candidates=provider==='claude'?['.local/bin/claude','.npm-global/bin/claude']:['.npm-global/bin/codex','.local/bin/codex'];
  for(const relative of candidates){const file=path.join(os.homedir(),relative);if(await fs.access(file).then(()=>true,()=>false))return file;}
  return provider;
}
export function parseClaudeOutput(stdout) {
  let result;
  try { result=JSON.parse(stdout); }
  catch {
    const rows=stdout.split(/\r?\n/).filter(Boolean).map(line=>{try{return JSON.parse(line);}catch{return null;}}).filter(Boolean);
    result=rows.reverse().find(row=>row.type==='result') || rows[rows.length-1];
  }
  if(result.is_error||result.subtype!=='success')throw new Error(`Claude CLI 생성 실패: ${(result.errors||[]).join(' ')||result.result||result.subtype}`);
  if(!result.structured_output||typeof result.structured_output!=='object')throw new Error('Claude CLI의 생성 결과를 읽을 수 없습니다.');
  return result.structured_output;
}
export async function execute(prompt,schema,dir,name,imagePath,provider='codex') {
  provider=normalizeProvider(provider);dir=path.resolve(dir);
  const schemaFile=path.join(dir,`${name}.schema.json`),outputFile=path.join(dir,`${name}.json`);
  await fs.writeFile(schemaFile,JSON.stringify(schema));
  const binary=await cliBinary(provider);
  if(provider==='claude') {
    const args=['--print','--output-format',imagePath?'stream-json':'json','--json-schema',JSON.stringify(schema),'--no-session-persistence','--tools','','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--setting-sources','','--disable-slash-commands'];
    if(process.env.CLAUDE_MODEL)args.push('--model',process.env.CLAUDE_MODEL);
    let input=prompt;
    if(imagePath){
      args.push('--input-format','stream-json','--verbose');
      const bytes=await fs.readFile(path.resolve(imagePath));
      input=JSON.stringify({type:'user',message:{role:'user',content:[{type:'image',source:{type:'base64',media_type:'image/png',data:bytes.toString('base64')}},{type:'text',text:prompt}]}})+'\n';
    }
    const result=parseClaudeOutput(await run(binary,args,{input,cwd:dir,timeout:480000}));
    await fs.writeFile(outputFile,JSON.stringify(result));return result;
  }
  const args=['exec','--skip-git-repo-check','--ephemeral','--sandbox','read-only','--ignore-user-config','--color','never','--output-schema',schemaFile,'--output-last-message',outputFile,'-'];
  if(process.env.CODEX_MODEL)args.splice(args.length-1,0,'--model',process.env.CODEX_MODEL);
  if(imagePath)args.splice(args.length-1,0,'--image',path.resolve(imagePath));
  await run(binary,args,{input:prompt,cwd:dir,timeout:480000});
  return JSON.parse(await fs.readFile(outputFile,'utf8'));
}
