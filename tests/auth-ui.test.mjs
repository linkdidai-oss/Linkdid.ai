import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
async function screen(overrides={}){
 const dom=new JSDOM('<main id="app"></main>',{url:'https://linkdid-ai.vercel.app/signin',runScripts:'outside-only'});
 const w=dom.window;w.fetch=async()=>new Response('{}');w.Headers=Headers;w.Request=Request;
 const calls=[];const auth={getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{},signUp:async args=>{calls.push(['signup',args]);return {data:{session:null}}},signInWithPassword:async args=>{calls.push(['signin',args]);return {error:{code:'invalid_credentials'}}},resend:async args=>{calls.push(['resend',args]);return {}},resetPasswordForEmail:async(...args)=>{calls.push(['reset',args]);return {}},...overrides};
 w.createClient=()=>({auth});w.linkedProject={url:'https://test.supabase.co',key:'public'};
 w.eval(readFileSync('portable/auth-client.js','utf8').replace(/^import .*;\n/gm,''));await w.linkdidSignIn();
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 return {w,calls,settle,close:()=>w.close(),q:s=>w.document.querySelector(s)};
}
test('simple signup uses only email and password and shows pending confirmation honestly',async()=>{
 const s=await screen();try{
 s.q('[data-mode="signup"]').click();assert.equal(s.q('h1').textContent,'Create your account');assert.equal(s.calls.length,0);assert.equal(s.q('[name=confirm]'),null);assert.equal(s.q('#send-code'),null);
 s.q('[name=email]').value='test@example.com';s.q('[name=password]').value='test-only-password';s.q('form').dispatchEvent(new s.w.Event('submit',{cancelable:true}));await s.settle();assert.equal(s.calls[0][0],'signup');assert.match(s.q('#auth-message').textContent,/confirm your email/);assert.equal(s.q('#resend-confirmation').hidden,false);assert.equal(s.q('button[type=submit]').disabled,false);
 }finally{s.close()}
});
test('invalid sign-in restores form and shows actionable error',async()=>{
 const s=await screen();try{s.q('[name=email]').value='test@example.com';s.q('[name=password]').value='test-only-password';s.q('form').dispatchEvent(new s.w.Event('submit',{cancelable:true}));await s.settle();assert.match(s.q('#auth-message').textContent,/incorrect/);assert.equal(s.q('button[type=submit]').disabled,false)}finally{s.close()}
});
test('confirmation resend and reset need email only, not password',async()=>{
 const s=await screen();try{s.q('[name=email]').value='test@example.com';s.q('#resend-confirmation').click();await s.settle();assert.equal(s.calls[0][0],'resend');s.q('[data-mode=reset]').click();assert.equal(s.q('[name=password]').required,false);s.q('form').dispatchEvent(new s.w.Event('submit',{cancelable:true}));await s.settle();assert.equal(s.calls[1][0],'reset');assert.match(s.q('#auth-message').textContent,/reset link/)}finally{s.close()}
});

test('obfuscated duplicate signup does not promise a confirmation email',async()=>{
 const s=await screen({signUp:async()=>({data:{session:null,user:{identities:[]}}})});try{
 s.q('[data-mode=signup]').click();s.q('[name=email]').value='test@example.com';s.q('[name=password]').value='test-only-password';s.q('form').dispatchEvent(new s.w.Event('submit',{cancelable:true}));await s.settle();assert.match(s.q('#auth-message').textContent,/original password/);assert.doesNotMatch(s.q('#auth-message').textContent,/confirm your email/);assert.equal(s.q('#resend-confirmation').hidden,true);
 }finally{s.close()}
});
