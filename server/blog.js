import {lookup} from 'node:dns/promises';
import {isIP,BlockList} from 'node:net';
import http from 'node:http';
import https from 'node:https';
import {JSDOM} from 'jsdom';
import {Readability} from '@mozilla/readability';

const blocked=new BlockList();
for(const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['224.0.0.0',3]])blocked.addSubnet(address,prefix,'ipv4');
for(const [address,prefix] of [['::',128],['::1',128],['fc00::',7],['fe80::',10],['ff00::',8]])blocked.addSubnet(address,prefix,'ipv6');
export function isPublicAddress(address){
  const family=isIP(address);
  return !!family&&!blocked.check(address,family===4?'ipv4':'ipv6');
}
export function blogUrl(value){
  let url;try{url=new URL(value);}catch{throw new Error('올바른 블로그 URL을 입력하세요.');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||!['','80','443'].includes(url.port))throw new Error('공개된 HTTP 또는 HTTPS 블로그 URL을 입력하세요.');
  const host=url.hostname.replace(/^\[|\]$/g,'');
  if(host==='localhost'||host.endsWith('.localhost')||(isIP(host)&&!isPublicAddress(host)))throw new Error('공개된 블로그 URL만 사용할 수 있습니다.');
  return url;
}
async function readHtml(value,redirects=0){
  const url=blogUrl(value),host=url.hostname.replace(/^\[|\]$/g,'');
  const addresses=await lookup(host,{all:true});
  if(!addresses.length||addresses.some(a=>!isPublicAddress(a.address)))throw new Error('공개된 블로그 URL만 사용할 수 있습니다.');
  // Pin the validated DNS result for the request, including each redirect.
  const address=addresses[0];
  const response=await new Promise((resolve,reject)=>{
    const req=(url.protocol==='https:'?https:http).get(url,{
      agent:false,headers:{'User-Agent':'Mozilla/5.0 D.one Magazine Studio','Accept':'text/html,application/xhtml+xml'},
      lookup:(_host,options,callback)=>options.all?callback(null,[address]):callback(null,address.address,address.family),
    },res=>{
      if([301,302,303,307,308].includes(res.statusCode)){res.resume();resolve({redirect:res.headers.location});return;}
      if(res.statusCode!==200){res.resume();reject(new Error(`블로그를 가져오지 못했습니다 (HTTP ${res.statusCode}). 본문을 직접 붙여넣어 주세요.`));return;}
      if(!/text\/html|application\/xhtml\+xml/i.test(res.headers['content-type']||'')){res.resume();reject(new Error('블로그 HTML 페이지를 입력하세요.'));return;}
      const chunks=[];let size=0;
      res.on('data',chunk=>{size+=chunk.length;if(size>5*1024*1024){res.destroy(new Error('블로그 페이지가 너무 큽니다. 본문을 직접 붙여넣어 주세요.'));}else chunks.push(chunk);});
      res.on('error',reject);res.on('end',()=>resolve({html:Buffer.concat(chunks),url:url.href}));
    });
    const timer=setTimeout(()=>req.destroy(new Error('블로그 응답 시간이 초과되었습니다. 본문을 직접 붙여넣어 주세요.')),20000);
    req.on('close',()=>clearTimeout(timer));req.on('error',reject);
  });
  if('redirect' in response){
    if(!response.redirect||redirects>=4)throw new Error('블로그 주소 이동이 너무 많습니다. 최종 글 URL을 입력하세요.');
    return readHtml(new URL(response.redirect,url).href,redirects+1);
  }
  return response;
}
export function extractBlog(html,url){
  const dom=new JSDOM(html,{url});
  try{
    const article=new Readability(dom.window.document,{charThreshold:80,maxElemsToParse:50000,serializer:el=>el}).parse();
    if(!article)throw new Error('블로그 본문을 찾지 못했습니다. 글 내용을 직접 붙여넣어 주세요.');
    article.content.querySelectorAll('br').forEach(el=>el.replaceWith('\n'));
    article.content.querySelectorAll('p,h1,h2,h3,h4,li,blockquote,pre').forEach(el=>el.append('\n'));
    const text=article.content.textContent.replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim();
    if(text.length<80)throw new Error('블로그 본문이 너무 짧거나 읽을 수 없습니다. 글 내용을 직접 붙여넣어 주세요.');
    if(text.length>1000000)throw new Error('블로그 본문은 100만 자 이하로 입력하세요.');
    const segments=[];
    for(const line of text.split('\n').map(s=>s.trim()).filter(Boolean))for(let i=0;i<line.length;i+=1800)segments.push({id:segments.length+1,start:null,text:line.slice(i,i+1800)});
    return {type:'blog',mode:'blog',url,title:article.title||'',author:article.byline||'',segments};
  }finally{dom.window.close();}
}
export async function downloadBlog(value){
  let {html,url}=await readHtml(value);
  // Naver's desktop post URL wraps the article in a mainFrame iframe.
  if(new URL(url).hostname==='blog.naver.com'){
    const dom=new JSDOM(html,{url});
    const frame=dom.window.document.querySelector('iframe#mainFrame')?.getAttribute('src');dom.window.close();
    if(frame){const next=new URL(frame,url);if(next.hostname==='blog.naver.com')({html,url}=await readHtml(next.href));}
  }
  return extractBlog(html,url);
}
