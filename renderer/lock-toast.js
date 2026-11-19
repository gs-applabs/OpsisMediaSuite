const keyNames = { caps: 'desktop.caps', num: 'desktop.num', scroll: 'desktop.scroll' };
window.mediaFlyout.onLock(({ key, enabled, lang, theme }) => {
  currentLang = Object.hasOwn(I18N, lang) ? lang : 'el';
  applyI18n();
  document.documentElement.dataset.theme = theme;
  document.getElementById('lock-name').textContent = t(keyNames[key]);
  document.getElementById('lock-state').textContent = enabled ? t('desktop.on') : t('desktop.off');
});
