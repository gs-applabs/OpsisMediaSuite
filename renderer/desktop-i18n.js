// Desktop controls share the main application's language without writing preferences from a secondary window.
const desktopKeys = ['source', 'mixer', 'unavailable', 'failed', 'master', 'lockKeys', 'widget', 'caps', 'num', 'scroll', 'on', 'off'];
const desktopTranslations = {
  el: ['Πηγή αναπαραγωγής', 'Μίκτης ήχου των Windows', 'Δεν υπάρχει διαθέσιμη έξοδος ήχου.', 'Η ρύθμιση δεν εφαρμόστηκε.', 'Ένταση συστήματος', 'Ενδείξεις πλήκτρων κλειδώματος', 'Χειριστήριο στη γραμμή εργασιών', 'Κλείδωμα κεφαλαίων', 'Αριθμητικό πληκτρολόγιο', 'Κλείδωμα κύλισης', 'Ενεργό', 'Ανενεργό'],
  en: ['Playback source', 'Windows volume mixer', 'No audio output is available.', 'The change could not be applied.', 'System volume', 'Lock key indicators', 'Taskbar media widget', 'Caps Lock', 'Num Lock', 'Scroll Lock', 'On', 'Off'],
  fr: ['Source de lecture', 'Mélangeur de volume Windows', 'Aucune sortie audio disponible.', 'La modification a échoué.', 'Volume système', 'Indicateurs de verrouillage', 'Lecteur de la barre des tâches', 'Verr. maj.', 'Verr. num.', 'Arrêt défil.', 'Activé', 'Désactivé'],
  de: ['Wiedergabequelle', 'Windows-Lautstärkemixer', 'Keine Audioausgabe verfügbar.', 'Die Änderung konnte nicht angewendet werden.', 'Systemlautstärke', 'Status der Feststelltasten', 'Mediensteuerung in der Taskleiste', 'Feststelltaste', 'Num-Taste', 'Rollen-Taste', 'Ein', 'Aus'],
  es: ['Fuente de reproducción', 'Mezclador de volumen de Windows', 'No hay ninguna salida de audio disponible.', 'No se pudo aplicar el cambio.', 'Volumen del sistema', 'Indicadores de teclas de bloqueo', 'Control multimedia en la barra de tareas', 'Bloq Mayús', 'Bloq Num', 'Bloq Despl', 'Activado', 'Desactivado'],
  it: ['Sorgente di riproduzione', 'Mixer volume di Windows', 'Nessuna uscita audio disponibile.', 'Impossibile applicare la modifica.', 'Volume di sistema', 'Indicatori dei tasti di blocco', 'Controllo multimediale nella barra delle applicazioni', 'Bloc Maiusc', 'Bloc Num', 'Bloc Scorr', 'Attivo', 'Inattivo'],
  pt: ['Fonte de reprodução', 'Misturador de volume do Windows', 'Não há saída de áudio disponível.', 'Não foi possível aplicar a alteração.', 'Volume do sistema', 'Indicadores de teclas de bloqueio', 'Controlo multimédia na barra de tarefas', 'Bloq Maiús', 'Bloq Num', 'Bloq Desl', 'Ativo', 'Inativo'],
  ru: ['Источник воспроизведения', 'Микшер громкости Windows', 'Нет доступного аудиовыхода.', 'Не удалось применить изменение.', 'Громкость системы', 'Индикаторы клавиш блокировки', 'Медиаплеер на панели задач', 'Caps Lock', 'Num Lock', 'Scroll Lock', 'Вкл.', 'Выкл.'],
  tr: ['Oynatma kaynağı', 'Windows ses düzeyi karıştırıcısı', 'Kullanılabilir ses çıkışı yok.', 'Değişiklik uygulanamadı.', 'Sistem ses düzeyi', 'Kilit tuşu göstergeleri', 'Görev çubuğunda medya denetimi', 'Büyük harf kilidi', 'Sayı kilidi', 'Kaydırma kilidi', 'Açık', 'Kapalı'],
  pl: ['Źródło odtwarzania', 'Mikser głośności Windows', 'Brak dostępnego wyjścia audio.', 'Nie udało się zastosować zmiany.', 'Głośność systemu', 'Wskaźniki klawiszy blokady', 'Sterowanie multimediami na pasku zadań', 'Caps Lock', 'Num Lock', 'Scroll Lock', 'Wł.', 'Wył.'],
  nl: ['Afspeelbron', 'Windows-volumemixer', 'Er is geen audio-uitvoer beschikbaar.', 'De wijziging kon niet worden toegepast.', 'Systeemvolume', 'Status van vergrendeltoetsen', 'Mediabediening op de taakbalk', 'Caps Lock', 'Num Lock', 'Scroll Lock', 'Aan', 'Uit'],
  sv: ['Uppspelningskälla', 'Volymmixern i Windows', 'Ingen ljudutgång är tillgänglig.', 'Det gick inte att tillämpa ändringen.', 'Systemvolym', 'Indikatorer för låstangenter', 'Mediaknappar i aktivitetsfältet', 'Caps Lock', 'Num Lock', 'Scroll Lock', 'På', 'Av'],
  da: ['Afspilningskilde', 'Lydstyrkemixer i Windows', 'Ingen lydudgang er tilgængelig.', 'Ændringen kunne ikke anvendes.', 'Systemlydstyrke', 'Indikatorer for låsetaster', 'Medieknapper på proceslinjen', 'Caps Lock', 'Num Lock', 'Scroll Lock', 'Til', 'Fra'],
  no: ['Avspillingskilde', 'Volummikser i Windows', 'Ingen lydutgang er tilgjengelig.', 'Endringen kunne ikke brukes.', 'Systemvolum', 'Indikatorer for låsetaster', 'Mediekontroller på oppgavelinjen', 'Caps Lock', 'Num Lock', 'Scroll Lock', 'På', 'Av'],
  fi: ['Toistolähde', 'Windowsin äänenvoimakkuuden mikseri', 'Äänilähtöä ei ole käytettävissä.', 'Muutosta ei voitu ottaa käyttöön.', 'Järjestelmän äänenvoimakkuus', 'Lukitusnäppäinten ilmaisimet', 'Mediaohjaimet tehtäväpalkissa', 'Caps Lock', 'Num Lock', 'Scroll Lock', 'Käytössä', 'Pois käytöstä'],
  cs: ['Zdroj přehrávání', 'Směšovač hlasitosti Windows', 'Není k dispozici žádný zvukový výstup.', 'Změnu se nepodařilo použít.', 'Hlasitost systému', 'Indikátory kláves zámku', 'Ovládání médií na hlavním panelu', 'Caps Lock', 'Num Lock', 'Scroll Lock', 'Zapnuto', 'Vypnuto'],
  sk: ['Zdroj prehrávania', 'Zmiešavač hlasitosti Windows', 'Nie je dostupný žiadny zvukový výstup.', 'Zmenu sa nepodarilo použiť.', 'Hlasitosť systému', 'Indikátory klávesov zámku', 'Ovládanie médií na paneli úloh', 'Caps Lock', 'Num Lock', 'Scroll Lock', 'Zapnuté', 'Vypnuté'],
  hu: ['Lejátszási forrás', 'Windows hangerőkeverő', 'Nincs elérhető hangkimenet.', 'A módosítás nem alkalmazható.', 'Rendszerhangerő', 'Zárbillentyűk állapotjelzői', 'Médiavezérlő a tálcán', 'Caps Lock', 'Num Lock', 'Scroll Lock', 'Be', 'Ki'],
  ro: ['Sursă de redare', 'Mixerul de volum Windows', 'Nu există nicio ieșire audio disponibilă.', 'Modificarea nu a putut fi aplicată.', 'Volumul sistemului', 'Indicatoare pentru tastele de blocare', 'Control media în bara de activități', 'Caps Lock', 'Num Lock', 'Scroll Lock', 'Activat', 'Dezactivat'],
  uk: ['Джерело відтворення', 'Мікшер гучності Windows', 'Немає доступного аудіовиходу.', 'Не вдалося застосувати зміну.', 'Гучність системи', 'Індикатори клавіш блокування', 'Керування медіа на панелі завдань', 'Caps Lock', 'Num Lock', 'Scroll Lock', 'Увімкнено', 'Вимкнено'],
};
for (const [lang, labels] of Object.entries(desktopTranslations)) {
  desktopKeys.forEach((key, index) => { I18N[lang]['desktop.' + key] = labels[index]; });
}

const taskbarKeys = ['widgetPosition', 'widgetStart', 'widgetCenter', 'widgetEnd', 'widgetLegacy', 'widgetLegacyHint'];
const taskbarTranslations = {
  el: ['Θέση χειριστηρίου', 'Αρχή', 'Κέντρο', 'Τέλος', 'Κλασική μέτρηση γραμμής εργασιών', 'Χρησιμοποιεί τα όρια του παραθύρου του Explorer.'],
  en: ['Widget position', 'Start', 'Center', 'End', 'Classic taskbar measurement', 'Uses the Explorer window bounds.'],
  fr: ['Position de la commande', 'Début', 'Centre', 'Fin', 'Mesure classique de la barre des tâches', 'Utilise les dimensions de la fenêtre de l’Explorateur.'],
  de: ['Position der Mediensteuerung', 'Anfang', 'Mitte', 'Ende', 'Klassische Taskleistenmessung', 'Verwendet die Abmessungen des Explorer-Fensters.'],
  es: ['Posición del control', 'Inicio', 'Centro', 'Final', 'Medición clásica de la barra de tareas', 'Usa los límites de la ventana del Explorador.'],
  it: ['Posizione del controllo', 'Inizio', 'Centro', 'Fine', 'Misurazione classica della barra delle applicazioni', 'Usa i limiti della finestra di Esplora file.'],
  pt: ['Posição do controlo', 'Início', 'Centro', 'Fim', 'Medição clássica da barra de tarefas', 'Usa os limites da janela do Explorador.'],
  ru: ['Положение виджета', 'Начало', 'Центр', 'Конец', 'Классическое измерение панели задач', 'Использует границы окна Проводника.'],
  tr: ['Medya denetimi konumu', 'Başlangıç', 'Orta', 'Son', 'Klasik görev çubuğu ölçümü', 'Gezgin penceresinin sınırlarını kullanır.'],
  pl: ['Pozycja sterowania', 'Początek', 'Środek', 'Koniec', 'Klasyczny pomiar paska zadań', 'Używa granic okna Eksploratora.'],
  nl: ['Positie van de mediabediening', 'Begin', 'Midden', 'Einde', 'Klassieke taakbalkmeting', 'Gebruikt de grenzen van het Verkenner-venster.'],
  sv: ['Medieknapparnas placering', 'Början', 'Mitten', 'Slutet', 'Klassisk mätning av aktivitetsfältet', 'Använder Utforskarfönstrets gränser.'],
  da: ['Medieknappernes placering', 'Start', 'Midte', 'Slut', 'Klassisk måling af proceslinjen', 'Bruger Stifinder-vinduets grænser.'],
  no: ['Plassering av mediekontroller', 'Start', 'Midten', 'Slutt', 'Klassisk måling av oppgavelinjen', 'Bruker grensene til Utforsker-vinduet.'],
  fi: ['Mediaohjainten sijainti', 'Alku', 'Keskellä', 'Loppu', 'Perinteinen tehtäväpalkin mittaus', 'Käyttää Resurssienhallinnan ikkunan rajoja.'],
  cs: ['Umístění ovládání', 'Začátek', 'Střed', 'Konec', 'Klasické měření hlavního panelu', 'Použije okraje okna Průzkumníka.'],
  sk: ['Poloha ovládania', 'Začiatok', 'Stred', 'Koniec', 'Klasické meranie panela úloh', 'Použije hranice okna Prieskumníka.'],
  hu: ['A médiavezérlő helye', 'Eleje', 'Közép', 'Vége', 'A tálca klasszikus mérése', 'A Fájlkezelő ablakhatárait használja.'],
  ro: ['Poziția controlului', 'Început', 'Centru', 'Sfârșit', 'Măsurare clasică a barei de activități', 'Folosește limitele ferestrei Explorer.'],
  uk: ['Положення віджета', 'Початок', 'Центр', 'Кінець', 'Класичне вимірювання панелі завдань', 'Використовує межі вікна Провідника.'],
};
for (const [lang, labels] of Object.entries(taskbarTranslations)) {
  taskbarKeys.forEach((key, index) => { I18N[lang]['desktop.' + key] = labels[index]; });
}


const taskbarStatusLabels = {
  el: 'Κατάσταση γραμμής εργασιών', en: 'Taskbar status', fr: 'État de la barre des tâches', de: 'Taskleistenstatus',
  es: 'Estado de la barra de tareas', it: 'Stato della barra delle applicazioni', pt: 'Estado da barra de tarefas',
  ru: 'Состояние панели задач', tr: 'Görev çubuğu durumu', pl: 'Stan paska zadań', nl: 'Taakbalkstatus',
  sv: 'Aktivitetsfältets status', da: 'Status for proceslinjen', no: 'Status for oppgavelinjen',
  fi: 'Tehtäväpalkin tila', cs: 'Stav hlavního panelu', sk: 'Stav panela úloh', hu: 'A tálca állapota',
  ro: 'Starea barei de activități', uk: 'Стан панелі завдань',
};
for (const [lang, label] of Object.entries(taskbarStatusLabels)) I18N[lang]['desktop.widgetStatus'] = label;


const widgetKeys = ['desktop.widgetCoverBackground', 'desktop.widgetMinimized', 'desktop.widgetManual',
  'desktop.widgetDrag', 'settings.accentReset'];
const widgetTranslations = {
  el: ["Θόλωση εξωφύλλου στο χειριστήριο", "Μόνο όταν το Opsis είναι ελαχιστοποιημένο", "Χειροκίνητη θέση", "Σύρετε για να μετακινήσετε το χειριστήριο στη γραμμή εργασιών", "Προεπιλογή των Windows"],
  en: ["Blur album cover in the widget", "Only when Opsis is minimized", "Manual position", "Drag to move the widget along the taskbar", "Windows default"],
  fr: ["Flouter la pochette dans le widget", "Uniquement lorsque Opsis est réduit", "Position manuelle", "Faites glisser le widget le long de la barre des tâches", "Valeur par défaut de Windows"],
  de: ["Albumcover im Widget weichzeichnen", "Nur wenn Opsis minimiert ist", "Manuelle Position", "Widget entlang der Taskleiste ziehen", "Windows-Standard"],
  es: ["Difuminar la portada en el widget", "Solo cuando Opsis está minimizado", "Posición manual", "Arrastra el widget por la barra de tareas", "Valor predeterminado de Windows"],
  it: ["Sfoca la copertina nel widget", "Solo quando Opsis è ridotto a icona", "Posizione manuale", "Trascina il widget lungo la barra delle applicazioni", "Impostazione predefinita di Windows"],
  pt: ["Desfocar a capa no widget", "Apenas quando o Opsis estiver minimizado", "Posição manual", "Arraste o widget ao longo da barra de tarefas", "Predefinição do Windows"],
  ru: ["Размыть обложку в виджете", "Только когда Opsis свёрнуто", "Ручное расположение", "Перетащите виджет вдоль панели задач", "По умолчанию в Windows"],
  tr: ["Pencere öğesindeki albüm kapağını bulanıklaştır", "Yalnızca Opsis simge durumundayken", "Elle konumlandırma", "Pencere öğesini görev çubuğu boyunca sürükleyin", "Windows varsayılanı"],
  pl: ["Rozmyj okładkę w widżecie", "Tylko gdy Opsis jest zminimalizowany", "Pozycja ręczna", "Przeciągnij widżet wzdłuż paska zadań", "Domyślne ustawienie systemu Windows"],
  nl: ["Albumhoes in de widget vervagen", "Alleen als Opsis is geminimaliseerd", "Handmatige positie", "Sleep de widget langs de taakbalk", "Windows-standaard"],
  sv: ["Gör albumomslaget i widgeten suddigt", "Bara när Opsis är minimerat", "Manuell placering", "Dra widgeten längs aktivitetsfältet", "Windows standard"],
  da: ["Slør albumcoveret i widgetten", "Kun når Opsis er minimeret", "Manuel placering", "Træk widgetten langs proceslinjen", "Windows-standard"],
  no: ["Gjør albumomslaget i widgeten uskarpt", "Bare når Opsis er minimert", "Manuell plassering", "Dra widgeten langs oppgavelinjen", "Windows-standard"],
  fi: ["Sumenna albumikansi pienoissovelluksessa", "Vain kun Opsis on pienennetty", "Manuaalinen sijainti", "Vedä pienoissovellusta tehtäväpalkissa", "Windowsin oletus"],
  cs: ["Rozmazat obal alba ve widgetu", "Pouze při minimalizaci Opsis", "Ruční poloha", "Přetáhněte widget po hlavním panelu", "Výchozí nastavení Windows"],
  sk: ["Rozmazať obal albumu v miniaplikácii", "Iba keď je Opsis minimalizovaný", "Manuálna poloha", "Presuňte miniaplikáciu po paneli úloh", "Predvolené nastavenie Windows"],
  hu: ["Albumborító elmosása a widgetben", "Csak az Opsis kis méretre állításakor", "Kézi pozíció", "Húzza a widgetet a tálcán", "Windows alapértelmezés"],
  ro: ["Estompează coperta din widget", "Numai când Opsis este minimizat", "Poziție manuală", "Trage widgetul de-a lungul barei de activități", "Setarea implicită Windows"],
  uk: ["Розмити обкладинку у віджеті", "Лише коли Opsis згорнуто", "Ручне розташування", "Перетягніть віджет уздовж панелі завдань", "Типове налаштування Windows"],
};
for (const [lang, labels] of Object.entries(widgetTranslations)) {
  widgetKeys.forEach((key, index) => { I18N[lang][key] = labels[index]; });
}

const flyoutKeys = ["title","upNext","auto","autoHint"];
const flyoutTranslations = {
  el: ["Χειριστήριο ήχου","Επόμενο κομμάτι","Αυτόματη εμφάνιση χειριστηρίου","Εμφάνιση με τα πλήκτρα πολυμέσων και λίγο πριν από το επόμενο κομμάτι."],
  en: ["Audio flyout","Up next","Show audio flyout automatically","Show when you use media keys and shortly before the next track."],
  fr: ["Panneau audio","À suivre","Afficher automatiquement le panneau audio","Afficher lors de l’utilisation des touches multimédias et juste avant le morceau suivant."],
  de: ["Audio-Steuerung","Als Nächstes","Audio-Steuerung automatisch anzeigen","Bei Verwendung der Medientasten und kurz vor dem nächsten Titel anzeigen."],
  es: ["Panel de audio","A continuación","Mostrar el panel de audio automáticamente","Mostrar al usar las teclas multimedia y poco antes de la siguiente pista."],
  it: ["Pannello audio","Prossimo brano","Mostra automaticamente il pannello audio","Mostra quando usi i tasti multimediali e poco prima del brano successivo."],
  pt: ["Painel de áudio","A seguir","Mostrar automaticamente o painel de áudio","Mostrar ao usar as teclas multimédia e pouco antes da próxima faixa."],
  ru: ["Панель звука","Следующий трек","Показывать панель звука автоматически","Показывать при нажатии мультимедийных клавиш и незадолго до следующего трека."],
  tr: ["Ses paneli","Sıradaki parça","Ses panelini otomatik göster","Medya tuşlarını kullandığınızda ve sonraki parçadan hemen önce göster."],
  pl: ["Panel audio","Następny utwór","Pokazuj panel audio automatycznie","Pokazuj przy użyciu klawiszy multimedialnych i krótko przed następnym utworem."],
  nl: ["Audiopaneel","Hierna","Audiopaneel automatisch tonen","Tonen bij gebruik van mediatoetsen en kort voor het volgende nummer."],
  sv: ["Ljudpanel","Nästa låt","Visa ljudpanelen automatiskt","Visa när medieknapparna används och strax före nästa låt."],
  da: ["Lydpanel","Næste nummer","Vis lydpanelet automatisk","Vis ved brug af medietaster og kort før næste nummer."],
  no: ["Lydpanel","Neste spor","Vis lydpanelet automatisk","Vis når medietastene brukes og like før neste spor."],
  fi: ["Äänipaneeli","Seuraavaksi","Näytä äänipaneeli automaattisesti","Näytä medianäppäimiä käytettäessä ja juuri ennen seuraavaa kappaletta."],
  cs: ["Panel zvuku","Následuje","Zobrazovat panel zvuku automaticky","Zobrazit při použití multimediálních kláves a krátce před další skladbou."],
  sk: ["Panel zvuku","Nasleduje","Zobrazovať panel zvuku automaticky","Zobraziť pri použití multimediálnych klávesov a krátko pred ďalšou skladbou."],
  hu: ["Hangpanel","Következik","A hangpanel automatikus megjelenítése","Megjelenítés a médiagombok használatakor és röviddel a következő szám előtt."],
  ro: ["Panou audio","Urmează","Afișează automat panoul audio","Afișează la folosirea tastelor multimedia și cu puțin înaintea piesei următoare."],
  uk: ["Панель звуку","Наступна композиція","Показувати панель звуку автоматично","Показувати під час натискання мультимедійних клавіш і незадовго до наступної композиції."],
};
for (const [lang, labels] of Object.entries(flyoutTranslations)) {
  flyoutKeys.forEach((key, index) => { I18N[lang]['flyout.' + key] = labels[index]; });
}

Object.assign(I18N.el, {
  'settings.layoutClassic': 'Κλασική',
  'settings.bgEq': 'Λάμψη ισοσταθμιστή',
  'settings.bgWaves': 'Ροή κυματομορφής',
  'settings.bgNebula': 'Νεφέλωμα βινυλίου',
  'settings.bgStarfield': 'Έναστρος ουρανός',
  'settings.bgAurora': 'Κορδέλες σέλαος',
  'settings.bgVinylspin': 'Περιστρεφόμενο βινύλιο',
  'settings.bgParticledrift': 'Κίνηση σωματιδίων',
  'settings.bgMesh': 'Πλέγμα διαβάθμισης',
  'settings.bgGrid': 'Παλλόμενο πλέγμα',
  'settings.bgBokeh': 'Θολά φώτα',
});

function resolveDesktopLanguage(value) {
  const lang = typeof value === 'string' ? value.trim().toLowerCase().split(/[-_]/)[0] : '';
  return Object.hasOwn(I18N, lang) ? lang : 'el';
}

function taskbarStatusText(code, language) {
  if (code === 'WAITING-MINIMIZE' && language !== 'el') return I18N[language]?.['desktop.widgetMinimized'] || I18N.en['desktop.widgetMinimized'];
  if (!code || language !== 'el') return code;
  let message = {
    'WAITING-MINIMIZE': 'Θα εμφανιστεί μόλις ελαχιστοποιηθεί το Opsis',
    CHECKING: 'Έλεγχος σύνδεσης',
    'NO-TASKBAR': 'Δεν βρέθηκε γραμμή εργασιών',
    'NO-SPACE': 'Δεν βρέθηκε αρκετός ελεύθερος χώρος στη γραμμή εργασιών',
    'NO-BOUNDS': 'Δεν ήταν δυνατός ο υπολογισμός θέσης',
    'NOT-VISIBLE': 'Το χειριστήριο συνδέθηκε αλλά δεν είναι ορατό',
    'ATTACH-FAILED': 'Αποτυχία σύνδεσης με τον Explorer',
    'HELPER-EXIT': 'Το βοηθητικό πρόγραμμα των Windows σταμάτησε',
  }[code];
  if (code.startsWith('ATTACHED-')) message = 'Συνδέθηκε με τη γραμμή εργασιών';
  if (code.startsWith('PARTIAL-')) message = 'Συνδέθηκε σε μέρος των γραμμών εργασιών';
  if (code.startsWith('WIN32-')) message = 'Τα Windows απέρριψαν τη σύνδεση';
  return message ? `${message} (${code})` : code;
}

document.addEventListener?.('waveframe:language-changed', () => {
  for (const element of document.querySelectorAll('[data-i18n-title]')) {
    const label = t(element.dataset.i18nTitle);
    element.title = label;
    element.setAttribute('aria-label', label);
  }
});

// The playback probe, FFmpeg's encoder list, and Windows codec-pack detection are independent.
const dependencyKeys = ['videoEncoders', 'playbackHint', 'encoderHint', 'kLiteHint',
  'supported', 'maybe', 'unavailable', 'notDetected', 'notChecked'];
const dependencyTranslations = {
  el: ['Κωδικοποιητές μετατροπής βίντεο', 'Ενδείξεις υποστήριξης των παρακάτω συνδυασμών από τη μηχανή αναπαραγωγής του Opsis.', 'Κωδικοποιητές που δηλώνει το FFmpeg. Η χρήση υλικού εξαρτάται από την κάρτα γραφικών και τον οδηγό της.', 'Το K-Lite εγκαθιστά φίλτρα DirectShow για συμβατές εφαρμογές Windows. Το Opsis χρησιμοποιεί τη μηχανή του Electron για αναπαραγωγή και το FFmpeg για μετατροπή.', 'Υποστηρίζεται', 'Πιθανή υποστήριξη', 'Μη διαθέσιμο', 'Δεν εντοπίστηκε', 'Δεν ελέγχθηκε'],
  en: ['Video conversion encoders', 'Playback support reported by Opsis for these format combinations.', 'Encoders listed by FFmpeg. Hardware encoding depends on your graphics card and driver.', 'K-Lite installs DirectShow filters for compatible Windows apps. Opsis uses Electron for playback and FFmpeg for conversion.', 'Supported', 'Possible support', 'Unavailable', 'Not detected', 'Not checked'],
  fr: ['Encodeurs vidéo', 'Compatibilité signalée par Opsis pour ces formats.', 'Encodeurs listés par FFmpeg. L’encodage matériel dépend de la carte graphique et du pilote.', 'K-Lite installe des filtres DirectShow pour les applications Windows compatibles. Opsis utilise Electron pour la lecture et FFmpeg pour la conversion.', 'Pris en charge', 'Prise en charge possible', 'Indisponible', 'Non détecté', 'Non vérifié'],
  de: ['Encoder für die Videokonvertierung', 'Von Opsis gemeldete Wiedergabeunterstützung für diese Formate.', 'Von FFmpeg gelistete Encoder. Hardware-Encoding hängt von Grafikkarte und Treiber ab.', 'K-Lite installiert DirectShow-Filter für kompatible Windows-Apps. Opsis verwendet Electron zur Wiedergabe und FFmpeg zur Konvertierung.', 'Unterstützt', 'Möglicherweise unterstützt', 'Nicht verfügbar', 'Nicht erkannt', 'Nicht geprüft'],
  es: ['Codificadores de vídeo', 'Compatibilidad de reproducción indicada por Opsis para estos formatos.', 'Codificadores que indica FFmpeg. La codificación por hardware depende de la tarjeta gráfica y su controlador.', 'K-Lite instala filtros DirectShow para aplicaciones compatibles de Windows. Opsis usa Electron para reproducir y FFmpeg para convertir.', 'Compatible', 'Posiblemente compatible', 'No disponible', 'No detectado', 'Sin comprobar'],
  it: ['Codificatori video', 'Compatibilità di riproduzione indicata da Opsis per questi formati.', 'Codificatori elencati da FFmpeg. La codifica hardware dipende dalla scheda grafica e dal driver.', 'K-Lite installa filtri DirectShow per le app Windows compatibili. Opsis usa Electron per riprodurre e FFmpeg per convertire.', 'Supportato', 'Possibile supporto', 'Non disponibile', 'Non rilevato', 'Non verificato'],
  pt: ['Codificadores de vídeo', 'Compatibilidade de reprodução indicada pelo Opsis para estes formatos.', 'Codificadores listados pelo FFmpeg. A codificação por hardware depende da placa gráfica e do controlador.', 'O K-Lite instala filtros DirectShow para aplicações Windows compatíveis. O Opsis usa Electron para reproduzir e FFmpeg para converter.', 'Suportado', 'Possivelmente suportado', 'Indisponível', 'Não detetado', 'Não verificado'],
  ru: ['Кодировщики видео', 'Поддержка воспроизведения этих форматов в Opsis.', 'Кодировщики, указанные FFmpeg. Аппаратное кодирование зависит от видеокарты и драйвера.', 'K-Lite устанавливает фильтры DirectShow для совместимых приложений Windows. Opsis использует Electron для воспроизведения и FFmpeg для конвертации.', 'Поддерживается', 'Возможна поддержка', 'Недоступно', 'Не обнаружено', 'Не проверено'],
  tr: ['Video kodlayıcıları', 'Opsis’in bu biçimler için bildirdiği oynatma desteği.', 'FFmpeg tarafından listelenen kodlayıcılar. Donanım kodlaması ekran kartına ve sürücüsüne bağlıdır.', 'K-Lite, uyumlu Windows uygulamaları için DirectShow filtreleri kurar. Opsis oynatma için Electron, dönüştürme için FFmpeg kullanır.', 'Destekleniyor', 'Desteklenebilir', 'Kullanılamıyor', 'Algılanmadı', 'Kontrol edilmedi'],
  pl: ['Kodery wideo', 'Obsługa odtwarzania tych formatów zgłaszana przez Opsis.', 'Kodery zgłaszane przez FFmpeg. Kodowanie sprzętowe zależy od karty graficznej i sterownika.', 'K-Lite instaluje filtry DirectShow dla zgodnych aplikacji Windows. Opsis korzysta z Electron do odtwarzania i FFmpeg do konwersji.', 'Obsługiwany', 'Możliwa obsługa', 'Niedostępny', 'Nie wykryto', 'Nie sprawdzono'],
  nl: ['Video-encoders', 'Afspeelondersteuning die Opsis voor deze indelingen meldt.', 'Door FFmpeg vermelde encoders. Hardwarecodering hangt af van de videokaart en het stuurprogramma.', 'K-Lite installeert DirectShow-filters voor compatibele Windows-apps. Opsis gebruikt Electron voor afspelen en FFmpeg voor converteren.', 'Ondersteund', 'Mogelijk ondersteund', 'Niet beschikbaar', 'Niet gevonden', 'Niet gecontroleerd'],
  sv: ['Videokodare', 'Uppspelningsstöd som Opsis rapporterar för dessa format.', 'Kodare listade av FFmpeg. Hårdvarukodning beror på grafikkortet och drivrutinen.', 'K-Lite installerar DirectShow-filter för kompatibla Windows-appar. Opsis använder Electron för uppspelning och FFmpeg för konvertering.', 'Stöds', 'Kan stödjas', 'Ej tillgänglig', 'Hittades inte', 'Ej kontrollerad'],
  da: ['Videokodere', 'Afspilningsunderstøttelse som Opsis oplyser for disse formater.', 'Kodere angivet af FFmpeg. Hardwarekodning afhænger af grafikkort og driver.', 'K-Lite installerer DirectShow-filtre til kompatible Windows-apps. Opsis bruger Electron til afspilning og FFmpeg til konvertering.', 'Understøttet', 'Muligvis understøttet', 'Ikke tilgængelig', 'Ikke fundet', 'Ikke kontrolleret'],
  no: ['Videokodere', 'Avspillingsstøtte som Opsis rapporterer for disse formatene.', 'Kodere oppført av FFmpeg. Maskinvarekoding avhenger av grafikkortet og driveren.', 'K-Lite installerer DirectShow-filtre for kompatible Windows-apper. Opsis bruker Electron til avspilling og FFmpeg til konvertering.', 'Støttes', 'Kan være støttet', 'Ikke tilgjengelig', 'Ikke funnet', 'Ikke sjekket'],
  fi: ['Videokooderit', 'Opsisin ilmoittama toistotuki näille muodoille.', 'FFmpegin listaamat kooderit. Laitteistokoodaus riippuu näytönohjaimesta ja sen ajurista.', 'K-Lite asentaa DirectShow-suodattimia yhteensopiville Windows-sovelluksille. Opsis käyttää Electronia toistoon ja FFmpegiä muunnoksiin.', 'Tuettu', 'Mahdollinen tuki', 'Ei saatavilla', 'Ei havaittu', 'Ei tarkistettu'],
  cs: ['Kodéry videa', 'Podpora přehrávání těchto formátů podle Opsis.', 'Kodéry uvedené v FFmpeg. Hardwarové kódování závisí na grafické kartě a ovladači.', 'K-Lite instaluje filtry DirectShow pro kompatibilní aplikace Windows. Opsis používá Electron pro přehrávání a FFmpeg pro převod.', 'Podporováno', 'Možná podpora', 'Nedostupné', 'Nenalezeno', 'Neověřeno'],
  sk: ['Kódovače videa', 'Podpora prehrávania týchto formátov podľa Opsis.', 'Kódovače uvedené v FFmpeg. Hardvérové kódovanie závisí od grafickej karty a ovládača.', 'K-Lite inštaluje filtre DirectShow pre kompatibilné aplikácie Windows. Opsis používa Electron na prehrávanie a FFmpeg na konverziu.', 'Podporované', 'Možná podpora', 'Nedostupné', 'Nezistené', 'Neoverené'],
  hu: ['Videókódolók', 'Az Opsis által jelzett lejátszási támogatás ezekhez a formátumokhoz.', 'Az FFmpeg által felsorolt kódolók. A hardveres kódolás a videokártyától és az illesztőprogramtól függ.', 'A K-Lite DirectShow-szűrőket telepít a kompatibilis Windows-alkalmazásokhoz. Az Opsis Electront használ lejátszásra, az FFmpeget pedig konvertálásra.', 'Támogatott', 'Lehetséges támogatás', 'Nem érhető el', 'Nem található', 'Nincs ellenőrizve'],
  ro: ['Codificatoare video', 'Compatibilitatea la redare indicată de Opsis pentru aceste formate.', 'Codificatoare listate de FFmpeg. Codificarea hardware depinde de placa video și de driver.', 'K-Lite instalează filtre DirectShow pentru aplicații Windows compatibile. Opsis utilizează Electron pentru redare și FFmpeg pentru conversie.', 'Compatibil', 'Posibil compatibil', 'Indisponibil', 'Nedetectat', 'Neverificat'],
  uk: ['Кодувальники відео', 'Підтримка відтворення цих форматів у Opsis.', 'Кодувальники, які повідомляє FFmpeg. Апаратне кодування залежить від відеокарти та драйвера.', 'K-Lite установлює фільтри DirectShow для сумісних програм Windows. Opsis використовує Electron для відтворення та FFmpeg для перетворення.', 'Підтримується', 'Можлива підтримка', 'Недоступно', 'Не виявлено', 'Не перевірено'],
};
for (const [language, labels] of Object.entries(dependencyTranslations)) {
  dependencyKeys.forEach((key, i) => { I18N[language]['deps.' + key] = labels[i]; });
}
