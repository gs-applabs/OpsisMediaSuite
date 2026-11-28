'use strict';

document.getElementById('helpVersion').textContent = `v${window.waveframe?.version || '3.0.0-rc.1'}`;
document.getElementById('licenseYear').textContent = String(new Date().getFullYear());

window.waveframe?.onThemeSync?.((theme) => {
  document.documentElement.dataset.theme = theme;
});

document.querySelectorAll('.help-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.help-tab').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.help-pane').forEach((p) => {
      p.classList.toggle('active', p.id === `help-${btn.dataset.tab}`);
    });
  });
});

document.getElementById('helpWelcome').addEventListener('click', () => window.waveframe?.openWelcome?.());
document.getElementById('helpFamily').addEventListener('click', () => window.waveframe?.openFamily?.());

// full license texts (renderer/licenses.js)
for (const [k, v] of Object.entries(window.WAVEFRAME_LICENSES || {})) { const el = document.getElementById(`lic-${k}`); if (el) el.textContent = v; }

// The newest changelog entry is shown in the app's language (all 20); older entries stay in the static (Greek) text.
{
  const lang = new URLSearchParams(location.search).get('lang') || 'el';
  const ul = document.getElementById('changelogV200');
  if (ul && typeof I18N !== 'undefined') {
    const pick = (k) => (I18N[lang] && I18N[lang][k]) || I18N.en[k] || I18N.el[k];
    for (let i = 1; i <= 4; i++) { const li = document.createElement('li'); li.textContent = pick(`help.v200.${i}`); ul.appendChild(li); }
  }
}

{
  const lang = new URLSearchParams(location.search).get('lang') || 'el';
  const ul = document.getElementById('changelogV210');
  if (ul && typeof I18N !== 'undefined') {
    const pick = (k) => (I18N[lang] && I18N[lang][k]) || I18N.en[k] || I18N.el[k];
    for (let i = 1; i <= 3; i++) { const li = document.createElement('li'); li.textContent = pick(`help.v210.${i}`); ul.appendChild(li); }
  }
}


{
  const lang = new URLSearchParams(location.search).get('lang') || 'el';
  const ul = document.getElementById('changelogV230');
  if (ul && typeof I18N !== 'undefined') {
    const pick = (k) => (I18N[lang] && I18N[lang][k]) || I18N.en[k] || I18N.el[k];
    for (let i = 1; i <= 2; i++) { const li = document.createElement('li'); li.textContent = pick(`help.v230.${i}`); ul.appendChild(li); }
  }
}


{
  const lang = new URLSearchParams(location.search).get('lang') || 'el';
  const ul = document.getElementById('changelogV232');
  if (ul && typeof I18N !== 'undefined') {
    const pick = (k) => (I18N[lang] && I18N[lang][k]) || I18N.en[k] || I18N.el[k];
    const li = document.createElement('li'); li.textContent = pick('help.v232.1'); ul.appendChild(li);
  }
}

{
  const lang = new URLSearchParams(location.search).get('lang') || 'el';
  const ul = document.getElementById('changelogV240');
  if (ul && typeof I18N !== 'undefined') {
    const pick = (k) => (I18N[lang] && I18N[lang][k]) || I18N.en[k] || I18N.el[k];
    const li = document.createElement('li'); li.textContent = pick('help.v240.1'); ul.appendChild(li);
  }
}

{
  const lang = new URLSearchParams(location.search).get('lang') || 'el';
  const ul = document.getElementById('changelogV241');
  if (ul && typeof I18N !== 'undefined') {
    const pick = (k) => (I18N[lang] && I18N[lang][k]) || I18N.en[k] || I18N.el[k];
    const li = document.createElement('li'); li.textContent = pick('help.v241.1'); ul.appendChild(li);
  }
}

{
  const lang = new URLSearchParams(location.search).get('lang') || 'el';
  const ul = document.getElementById('changelogV242');
  if (ul && typeof I18N !== 'undefined') {
    const pick = (k) => (I18N[lang] && I18N[lang][k]) || I18N.en[k] || I18N.el[k];
    const li = document.createElement('li'); li.textContent = pick('help.v242.1'); ul.appendChild(li);
  }
}

{
const lang=new URLSearchParams(location.search).get('lang')||'el',gr=lang==='el';
const target=document.getElementById('featureHelpList');document.getElementById('featureHelpTitle').textContent=OpsisFeatureGuide.ui(lang).helpTitle;const guideUi=OpsisFeatureGuide.ui(lang);document.getElementById('featureHelpIntro').textContent=guideUi.welcome+' '+guideUi.experimental;
const search=document.getElementById('featureHelpSearch');document.getElementById('featureHelpSearchLabel').textContent=OpsisFeatureGuide.ui(lang).helpSearch;
function renderGuide(){const rows=OpsisFeatureGuide.list(lang,search.value,I18N[lang]||I18N.en);target.replaceChildren();let last='';for(const r of rows){if(r.tab!==last){const h=document.createElement('h3');h.textContent=r.category;target.append(h);last=r.tab;}const p=document.createElement('p'),b=document.createElement('strong');b.textContent=r.title;b.lang=r.descriptionLang;const d=document.createElement('span');d.lang=r.descriptionLang;d.textContent=': '+r.description;p.append(b);if(r.controlLabel&&r.controlLabel!==r.title)p.append(document.createTextNode(' ('+r.controlLabel+')'));p.append(d);target.append(p);}document.getElementById('featureHelpStatus').textContent=rows.length?guideUi.results+': '+rows.length:guideUi.empty;}
search.addEventListener('input',renderGuide);renderGuide();
for(const line of gr?['18E.1/18F: Inno Setup: επιτυχείς δοκιμές εγκατάστασης, αναβάθμισης και αφαίρεσης δοκιμαστικών εκδόσεων· τελική αποδοχή εκκρεμεί.','18G–18I: MP3/FLAC metadata, MusicBrainz, προεπισκόπηση και ακύρωση. AcoustID πειραματικό, απαιτεί κλειδί.','19A–19B: Αναζήτηση 68 ομάδων, Βοήθεια και οδηγός εκκίνησης. Οι βασικές ενδείξεις αναζήτησης διατίθενται σε 20 γλώσσες.','19C–19D.2: 90 ομάδες, περιορισμός συντομεύσεων στην ενεργή καρτέλα και διορθώσεις εναλλαγής πηγής ήχου. Ο πλήρης έλεγχος native player εκκρεμεί.']:['18E.1/18F: Inno Setup test fixtures: install, upgrade and removal passed; final release acceptance pending.','18G–18I: MP3/FLAC tags, MusicBrainz, preview and cancel. AcoustID experimental; requires a key.','19A–19B: Search 68 feature groups, Help and welcome guide. Core search labels in 20 languages.','19C–19D.2: 90 groups, tab-scoped shortcuts and audio source switching fixes. Full native player validation pending.']){const li=document.createElement('li');li.textContent=line;document.getElementById('featureHistory').append(li);}
}
