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


const taskbarCoverLabels = {
  el: 'Θολωμένο φόντο από το εξώφυλλο', en: 'Blurred album cover background', fr: 'Fond flou de la pochette',
  de: 'Unscharfes Albumcover als Hintergrund', es: 'Fondo con portada difuminada', it: 'Sfondo sfocato della copertina',
  pt: 'Fundo desfocado da capa', ru: 'Размытая обложка на фоне', tr: 'Bulanık albüm kapağı arka planı',
  pl: 'Rozmyta okładka w tle', nl: 'Vervaagde albumhoes als achtergrond', sv: 'Suddigt albumomslag som bakgrund',
  da: 'Sløret albumcover som baggrund', no: 'Uskarpt albumomslag som bakgrunn', fi: 'Sumennettu albumikansi taustalla',
  cs: 'Rozmazaný obal alba na pozadí', sk: 'Rozmazaný obal albumu na pozadí', hu: 'Elmosott albumborító-háttér',
  ro: 'Fundal estompat din coperta albumului', uk: 'Розмита обкладинка на тлі',
};
for (const [lang, label] of Object.entries(taskbarCoverLabels)) I18N[lang]['desktop.widgetCoverBackground'] = label;

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
