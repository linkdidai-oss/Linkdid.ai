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
let recoveryMode=new URLSearchParams(location.hash.slice(1)).get('type')==='recovery';
authClient.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY')recoveryMode=true});
window.linkdidSignIn=async()=>{
 const el=document.querySelector('#app'),next=safeNext(new URLSearchParams(location.search).get('next'));
 const {data,error}=await authClient.auth.getSession();
 if(data?.session&&!recoveryMode){location.replace(next);return}
 let mode=recoveryMode?'update':new URLSearchParams(location.search).get('mode')==='signup'?'signup':'signin',emailValue='',busy=false;
 const callback=location.origin+'/signin';
 function render(){
  const signup=mode==='signup',reset=mode==='reset',update=mode==='update',code=mode==='code';
  el.innerHTML=`<section class="auth-panel panel" aria-labelledby="auth-title"><a class="auth-back" href="/">← Back to leaderboard</a><h1 id="auth-title">${signup?'Create your account':reset?'Reset your password':update?'Choose a new password':code?'Check your email':'Welcome back'}</h1><p>${signup?'Create your profile and start earning gas.':reset?'We will email you a secure reset link.':update?'Choose at least 8 characters.':code?'Open the sign-in link, or enter the code if included.':'Sign in to manage your Linkdid profile.'}</p><form id="auth-form"><label ${update?'hidden':''}>Email<input name="email" type="email" autocomplete="email" ${update?'':'required'} maxlength="254"></label><label ${reset||code?'hidden':''}>${update?'New password':'Password'}<span class="auth-password"><input name="password" type="password" autocomplete="${signup||update?'new-password':'current-password'}" ${reset||code?'':'required'} ${signup||update?'minlength="8"':''} maxlength="128"><button type="button" id="show-password" aria-label="Show password">Show</button></span></label>${signup||update?'<label>Confirm password<input name="confirm" type="password" autocomplete="new-password" required minlength="8" maxlength="128"></label>':''}${code?'<label>Email code<input name="code" autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]{6,10}" required></label>':''}<p id="auth-message" role="status" aria-live="polite"></p><button class="button dark auth-submit" type="submit">${signup?'Create account':reset?'Send reset link':update?'Save password':code?'Verify code':'Sign in'}</button></form><div class="auth-options">${mode==='signin'?'<button type="button" data-mode="reset">Forgot password?</button><button type="button" id="send-code">Sign in with an email link</button>':''}${signup||mode==='signin'?'<button type="button" id="resend-confirmation">Resend confirmation email</button>':''}${!update?'<p>'+(signup?'Already have an account?':'New to Linkdid?')+' <button type="button" data-mode="'+(signup?'signin':'signup')+'">'+(signup?'Sign in':'Create account')+'</button></p>':''}${reset||code?'<button type="button" data-mode="signin">Back to sign in</button>':''}</div></section>`;
  const form=el.querySelector('#auth-form'),message=el.querySelector('#auth-message');form.elements.email.value=emailValue;
  const show=(text,isError=false)=>{message.textContent=text;message.classList.toggle('auth-error',isError)};
  const email=()=>{if(!form.elements.email.reportValidity())return null;return emailValue=form.elements.email.value.trim()};
  async function run(action,success){if(busy)return;busy=true;el.querySelectorAll('button').forEach(b=>b.disabled=true);form.setAttribute('aria-busy','true');show('Please wait…');try{const result=await action();if(result.error)throw result.error;success(result)}catch(e){show(e.code==='invalid_credentials'?'Email or password is incorrect. Try again or reset your password.':e.code==='email_not_confirmed'?'Confirm your email before signing in. Use Resend confirmation email below.':e.status===429?'Too many attempts. Please wait a few minutes and try again.':e.message||'Could not connect. Please try again.',true)}finally{busy=false;form.removeAttribute('aria-busy');el.querySelectorAll('button').forEach(b=>b.disabled=false)}}
  el.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{emailValue=form.elements.email.value;mode=b.dataset.mode;render()});
  el.querySelector('#show-password').onclick=e=>{const input=form.elements.password;input.type=input.type==='password'?'text':'password';e.target.textContent=input.type==='password'?'Show':'Hide';e.target.setAttribute('aria-label',input.type==='password'?'Show password':'Hide password')};
  form.onsubmit=e=>{e.preventDefault();if(!form.reportValidity())return;if(form.elements.confirm&&form.elements.password.value!==form.elements.confirm.value){show('Passwords do not match.',true);return}const address=update?null:email();
   if(reset)return run(()=>authClient.auth.resetPasswordForEmail(address,{redirectTo:callback}),()=>show('If this email has an account, a reset link has been sent. Check your inbox and spam folder.'));
   if(update)return run(()=>authClient.auth.updateUser({password:form.elements.password.value}),()=>{recoveryMode=false;location.replace(next)});
   if(code)return run(()=>authClient.auth.verifyOtp({email:address,token:form.elements.code.value.trim(),type:'email'}),()=>location.replace(next));
   run(()=>signup?authClient.auth.signUp({email:address,password:form.elements.password.value,options:{emailRedirectTo:callback}}):authClient.auth.signInWithPassword({email:address,password:form.elements.password.value}),result=>{if(result.data.session)location.replace(next);else{show('Check your inbox and spam folder to confirm your email, then sign in.');form.elements.password.value='';if(form.elements.confirm)form.elements.confirm.value=''}});
  };
  const resend=el.querySelector('#resend-confirmation');if(resend)resend.onclick=()=>{const address=email();if(address)run(()=>authClient.auth.resend({type:'signup',email:address,options:{emailRedirectTo:callback}}),()=>show('Confirmation requested. Check your inbox and spam folder.'))};
  const send=el.querySelector('#send-code');if(send)send.onclick=()=>{const address=email();if(address)run(()=>authClient.auth.signInWithOtp({email:address,options:{emailRedirectTo:callback,shouldCreateUser:false}}),()=>{mode='code';render()})};
 }
 render();
 if(error)el.querySelector('#auth-message').textContent=error.message;
};
document.addEventListener('click',async e=>{const a=e.target.closest('a[href^="/signout-with-chatgpt"]');if(!a)return;e.preventDefault();const {error}=await authClient.auth.signOut();if(error){window.alert('Could not sign out. Please try again.');return}location.assign('/')});
