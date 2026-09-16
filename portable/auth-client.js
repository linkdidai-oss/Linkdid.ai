import {createClient} from '@supabase/supabase-js';
const config=window.LINKDID_PUBLIC_CONFIG||{};
const authClient=config.url&&config.key?createClient(config.url,config.key):null;
const nativeFetch=window.fetch.bind(window);
window.fetch=async(input,options)=>{
 const url=new URL(typeof input==='string'?input:input.url,location.href);
 if(authClient&&url.origin===location.origin&&url.pathname.startsWith('/api/')){
  const {data}=await authClient.auth.getSession();const headers=new Headers(options?.headers||(input instanceof Request?input.headers:undefined));
  if(data.session)headers.set('authorization','Bearer '+data.session.access_token);
  options={...options,headers};
 }
 return nativeFetch(input,options);
};
window.linkdidLogin=()=>'<section class="page-state"><h1>Your spotlight starts here.</h1><p>Sign in with your email to create a profile and fill your tank.</p><a class="button dark" href="/signin">Sign in →</a></section>';
window.linkdidSignIn=async()=>{
 const el=document.querySelector('#app');
 if(!authClient){el.innerHTML='<section class="page-state"><h1>Sign-in setup is pending</h1><p>The operator needs to configure authentication for this deployment.</p><a href="/">Back to leaderboard</a></section>';return}
 el.innerHTML='<section class="account-wrap auth-panel panel"><h1>Welcome to Linkdid.</h1><p>Enter your email. We’ll send a one-time sign-in code.</p><form id="email-login"><label>Email<input name="email" type="email" autocomplete="email" required></label><button class="button dark">Send sign-in code</button></form><form id="code-login" hidden><label>Code from your email<input name="code" autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]{6,10}" required></label><button class="button dark">Sign in</button></form><p id="auth-message" role="status"></p><a href="/">Back to leaderboard</a></section>';
 let email='';const message=document.querySelector('#auth-message');
 document.querySelector('#email-login').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;email=e.target.elements.email.value.trim();try{const {error}=await authClient.auth.signInWithOtp({email});if(error)throw error;document.querySelector('#code-login').hidden=false;message.textContent='Check your email for the code. It may take a moment.'}catch(error){message.textContent=error.message}finally{b.disabled=false}};
 document.querySelector('#code-login').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{const {error}=await authClient.auth.verifyOtp({email,token:e.target.elements.code.value.trim(),type:'email'});if(error)throw error;location.replace('/account')}catch(error){message.textContent=error.message;b.disabled=false}};
};
document.addEventListener('click',async e=>{const a=e.target.closest('a[href^="/signout-with-chatgpt"]');if(!a)return;e.preventDefault();if(authClient)await authClient.auth.signOut();location.assign('/')});
