// Dedicated claim journey; gas and checkout continue using the existing server APIs.
const pumpCard = claimCard;
const pumpAction = fill;
const gasDashboard = dashboard;
const gasTick = tick;
const flowIcon = (kind) => kind === 'free' ? '⛽' : '↗';
claimCard = () => {
  const g = localGas(account?.gas, accountAt);
  return `<section class="spot-card" id="fuel-card"><div class="spot-card-top"><span>YOUR SPOTLIGHT</span><span>LinkedIn professionals</span></div><h2>A little fuel.<br>A bigger presence.</h2><div class="spot-balance"><strong id="gas-total">${litres(g.total)} <small>L</small></strong><span>Total gas balance</span></div><div class="spot-details"><span>Current rank <b data-own-rank>${account?.rank ? '#'+account.rank : '—'}</b></span><span>Free + paid gas</span></div><a class="claim-main" href="/claim">Claim your spot <span>↗</span></a><p>Fill gas for free or purchase at $1/L.<br>You choose how to fuel your profile.</p></section>`;
};
fill = async () => {
  if (location.pathname !== '/claim' || new URLSearchParams(location.search).get('mode') !== 'free') { location.href = '/claim'; return; }
  if (!session?.user || !account?.profile) { location.href = flowHref(null,true); return; }
  await pumpAction();
};
dashboard = () => { gasDashboard(); if (session?.user) { const h = $('.account-wrap h1'); if(h) h.textContent = 'Your professional spotlight.'; const params=new URLSearchParams(location.search),form=$('#profile-form'); if(form&&!account?.profile){form.elements.url.value=params.get('profileLink')||'';if(cats.includes(params.get('specialty')))form.elements.category.value=params.get('specialty');} } };
function flowHref(mode,setup=false){const q=new URLSearchParams(location.search);q.delete('mode');q.delete('next');if(mode)q.set('mode',mode);if(setup)q.set('next','/claim');return (setup?'/account':'/claim')+(q.size?'?'+q.toString():'');}
function wireFlow(){document.querySelectorAll('a[href^="/claim?mode="],a[href="/account?next=%2Fclaim"]').forEach(a=>{const href=a.getAttribute('href'),setup=href.startsWith('/account');a.setAttribute('href',flowHref(setup?null:new URLSearchParams(href.split('?')[1]).get('mode'),setup))});}

function claimIntro(mode = '') {
  return `<div class="claim-heading"><a class="claim-back" href="/">← Back to leaderboard</a><div class="claim-heading-row"><div><span class="eyebrow">CLAIM YOUR SPOT</span><h1>How will you fuel up?</h1><p>Two ways to fill. One way to rise.</p></div><a class="claim-profile-link" href="${account?.profile ? '/account' : '/account?next=%2Fclaim'}">${account?.profile ? 'Manage profile ↗' : 'Create your profile ↗'}</a></div></div><nav class="fuel-choices" aria-label="Choose how to fill gas"><a href="/claim?mode=free" class="fuel-choice ${mode==='free'?'selected':''}" ${mode==='free'?'aria-current="page"':''}><div class="choice-top"><span class="choice-icon" aria-hidden="true">${flowIcon('free')}</span><span class="choice-tag">YOUR TIME, ZERO COST</span></div><h2>Fill Gas — Free</h2><p>Hold the pump and watch your tank fill.</p><div class="choice-price">$0 <span>always free</span></div><div class="choice-facts"><span>60 seconds holding = 1 L</span><span>Uses 1 L per hour</span></div><span class="choice-action">${mode==='free'?'Free pump selected':'Start filling for free'} <b>→</b></span></a><a href="/claim?mode=purchase" class="fuel-choice purchase-choice ${mode==='purchase'?'selected':''}" ${mode==='purchase'?'aria-current="page"':''}><div class="choice-top"><span class="choice-icon" aria-hidden="true">${flowIcon('purchase')}</span><span class="choice-tag">24× LONGER PER LITRE</span></div><h2>Purchase Gas</h2><p>Skip the clicks. Keep your tank fuelled longer.</p><div class="choice-price">$1 <span>per litre</span></div><div class="choice-facts"><span>Choose your litres</span><span>Uses 1 L per 24 hours</span></div><span class="choice-action">${mode==='purchase'?'Purchase selected':'Choose your gas amount'} <b>→</b></span></a></nav>`;
}
function claimRules() {
  return `<aside class="claim-rules"><strong>Your balance sets your rank.</strong><p>Free gas + paid gas = your total. The highest remaining total ranks first. Both tanks drain even when you’re away; your position can change as balances change.</p><a href="/about">See how ranking works ↗</a></aside>`;
}
async function claimPage() {
  const mode = new URLSearchParams(location.search).get('mode');
  document.title = 'Claim your spot — Linkdid';
  if (mode === 'purchase' && session?.user) {
    await pastPayments();
    const wrap = $('.account-wrap');
    wrap.classList.add('claim-purchase');
    wrap.insertAdjacentHTML('afterbegin', claimIntro('purchase'));
    const form = $('#gas-purchase');
    const label = form?.querySelector('button');
    if(label?.disabled) label.textContent = account?.profile ? 'Purchases coming soon' : 'Create your profile first';
    if(!account?.profile) form.insertAdjacentHTML('beforeend','<a class="secondary-btn setup-link" href="/account?next=%2Fclaim">Create profile →</a>');
    wrap.insertAdjacentHTML('beforeend', claimRules());
    wireFlow();
    return;
  }
  const setup = !session?.user || !account?.profile;
  const body = mode === 'free' ? `<div class="claim-workspace">${setup ? `<section class="claim-setup"><span class="eyebrow">ONE QUICK STEP</span><h2>${session?.user ? 'Give your gas a profile.' : 'Save your gas as you go.'}</h2><p>${session?.user ? 'Add your name and LinkedIn link, then come back to fill your tank.' : 'Sign in and create your profile to save every litre you earn.'}</p><a class="button dark" href="/account?next=%2Fclaim">${session?.user ? 'Create your profile' : 'Sign in & create profile'} →</a></section>` : pumpCard()}<div class="pump-guide"><span class="eyebrow">YOUR NEXT LITRE STARTS HERE</span><h2>Your next litre<br>starts with a hold.</h2><ol><li>Press and hold the pump with your mouse, finger or keyboard.</li><li>Hold for 60 seconds to earn 1 litre. Release to pause.</li><li>The pump stops at 1 litre. Release and press again to refill.</li></ol><p>Take a break whenever you like. Your earned gas and saved progress stay with your account.</p><a href="/">See the leaderboard ↗</a></div></div>` : mode === 'purchase' ? `<section class="claim-setup"><h2>Your paid tank starts with your profile.</h2><p>Sign in to choose your gas amount and view purchase availability.</p><a class="button dark" href="/account?next=%2Fclaim">Sign in & create profile →</a></section>` : `<div class="claim-choice-note"><span>01 Choose your fuel</span><span>02 Fill your tank</span><span>03 Climb the leaderboard</span></div>`;
  shell(`<section class="claim-wrap">${claimIntro(mode)}${body}${claimRules()}</section>`);
  wireFlow();
  if(mode==='free' && !setup) {
    const station=$('.gas-station');
    station.querySelector('h2').innerHTML='Ready. Set. <span>Refuel.</span>';
    station.querySelector('.buy-gas-button').href='/claim?mode=purchase';
    const meter=document.createElement('div');meter.className='litre-meter';meter.setAttribute('aria-hidden','true');
    meter.innerHTML='<span id="litre-liquid"></span><b>1 L</b>';
    $('.pump-zone').insertBefore(meter,$('#pump-trigger'));
    tick();
  }
}
tick = () => { gasTick();  const liquid=$('#litre-liquid');if(liquid)liquid.style.height=Math.max(3,pumpProgress/600)+'%'; };
