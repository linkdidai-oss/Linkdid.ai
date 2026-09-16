import {createClient} from '@supabase/supabase-js';
import {linkedProject} from './supabase-project.mjs';
const authClient=createClient(linkedProject.url,linkedProject.key);
const nativeFetch=window.fetch.bind(window);
window.linkdidAuthReady=async()=>authClient;
function safeNext(value){try{const u=new URL(value||'/account',location.origin);return u.origin===location.origin&&!u.pathname.startsWith('/signin')?u.pathname+u.search:'/account'}catch{return '/account'}}
window.linkdidRequireSignIn=async()=>{const {data}=await authClient.auth.getSession();if(!data.session){location.replace('/signin?next='+encodeURIComponent(location.pathname+location.search));return false}return true};
window.fetch=async(input,options)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
 if(url.origin===location.origin&&url.pathname.startsWith('/api/')){
  const {data}=await authClient.auth.getSession();const headers=new Headers(options?.headers||(input instanceof Request?input.headers:undefined));
  if(data.session)headers.set('authorization','Bearer '+data.session.access_token);
  options={...options,headers};
 }
 const response=await nativeFetch(input,options);
 if(response.status===401&&url.origin===location.origin&&url.pathname.startsWith('/api/')&&location.pathname!=='/signin')location.replace('/signin?next='+encodeURIComponent(location.pathname+location.search));
 return response;
};
window.linkdidLogin=()=>'<section class="page-state"><h1>Your spotlight starts here.</h1><p>Sign in to create a profile and fill your tank.</p><a class="button dark" href="/signin">Sign in →</a></section>';
window.linkdidSignIn=async()=>{
 const el=document.querySelector('#app'),next=safeNext(new URLSearchParams(location.search).get('next'));
 const {data}=await authClient.auth.getSession();if(data.session){location.replace(next);return}
 el.innerHTML='<section class="account-wrap auth-panel panel"><h1>Welcome to Linkdid.</h1><p>Sign in with your email and password.</p><form id="password-login"><label>Email<input name="email" type="email" autocomplete="email" required maxlength="254"></label><label>Password<input name="password" type="password" autocomplete="current-password" required maxlength="128"></label><button class="button dark" type="submit">Sign in</button><button class="secondary-btn" type="button" id="create-account">Create account</button></form><p id="auth-message" role="status" aria-live="polite"></p><button class="text-btn" type="button" id="use-email-code">Sign in with an email code instead</button><form id="code-login" hidden><label>Email code<input name="code" autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]{6,10}" required></label><button class="button dark">Verify code</button></form><p><a href="/">Back to leaderboard</a></p></section>';
 const form=document.querySelector('#password-login'),message=document.querySelector('#auth-message');let codeEmail='';
 async function passwordAuth(signup){
  const email=form.elements.email.value.trim(),password=form.elements.password.value;
  if(!form.reportValidity())return;
  if(signup&&password.length<8){message.textContent='Use at least 8 characters for your password.';return}
  const buttons=[...document.querySelectorAll('.auth-panel button')];buttons.forEach(b=>b.disabled=true);message.textContent='Please wait…';
  try{const result=signup?await authClient.auth.signUp({email,password,options:{emailRedirectTo:location.origin+'/signin'}}):await authClient.auth.signInWithPassword({email,password});if(result.error)throw result.error;
   if(result.data.session)location.replace(next);else{message.textContent='Check your email to confirm your account. After confirming, return here and sign in.';form.elements.password.value=''}
  }catch(error){message.textContent=error.message}finally{buttons.forEach(b=>b.disabled=false)}
 }
 form.onsubmit=e=>{e.preventDefault();passwordAuth(false)};
 document.querySelector('#create-account').onclick=()=>passwordAuth(true);
 document.querySelector('#use-email-code').onclick=async e=>{const email=form.elements.email;if(!email.reportValidity())return;e.target.disabled=true;codeEmail=email.value.trim();try{const {error}=await authClient.auth.signInWithOtp({email:codeEmail,options:{emailRedirectTo:location.origin+'/signin'}});if(error)throw error;document.querySelector('#code-login').hidden=false;message.textContent='Check your email. Open the sign-in link, or enter the code if your email includes one.'}catch(error){message.textContent=error.message}finally{e.target.disabled=false}};
 document.querySelector('#code-login').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{const {error}=await authClient.auth.verifyOtp({email:codeEmail,token:e.target.elements.code.value.trim(),type:'email'});if(error)throw error;location.replace(next)}catch(error){message.textContent=error.message;b.disabled=false}};
};
document.addEventListener('click',async e=>{const a=e.target.closest('a[href^="/signout-with-chatgpt"]');if(!a)return;e.preventDefault();const {error}=await authClient.auth.signOut();if(error){window.alert('Could not sign out. Please try again.');return}location.assign('/')});
