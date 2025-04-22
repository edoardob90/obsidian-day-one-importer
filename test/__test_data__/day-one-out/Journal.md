---
creationDate: 2025-03-18T22:23
modifiedDate: 2025-04-20T15:55
uuid: 67415FC549664D16973F2877BCC1C288
location: Leder Fässler AG, Dübendorf, Switzerland
latitude: 47.39687
longitude: 8.6035
---

Sono due giorni (credo) che sto perdendo una quantità enorme di tempo tra le _note taking app_. Di nuovo? Ancora?! Pensavo di aver trovato un equilibrio perfetto con il seguente setup:

- Apple Notes per le note “sparse”
- Bear per tutto ciò che voglio duri nel tempo

Le note “sparse” o _loose notes_ sono quelle di cui non mi interessa molto che sopravvivano. Sono spunti, appunti, idee, ritagli. È a tutti gli effetti un blocco note digitale. Non dobbiamo cadere vittime della _collector's fallacy_ (che poi è un'altra forma della FOMO).

Bear, invece, ha un altro scopo: raccoglie l’indice (o _JDex_) del Johnny.Decimal system con cui ho organizzata la cartella principale in cui archivio ogni _roba_ digitale che merita di essere archiviata. È fondamentale per sapere _dove_ cercare quello che mi serve o aggiungere/archiviare altri file. Lo trovo un sistema di una semplicità e di una potenza/flessibilità sorprendenti.

Però ho subito incontrato un problema con Bear, strettamente collegato con l’idea del JDex in cui ogni voce dell’indice è una nota. Scrive John Noble, creatore del sistema:

> Note-taking is one of my favourite uses of Johnny.Decimal. And if we've used a notes app to keep our JDex, we get notes 'for free'. There's already a note for each ID. Just type more words in it.

Cioè: ti basta riempire la nota relativa a un certo ID ed è fatta. No, non è così semplice (per me). Non voglio che una singola nota dell’indice diventi un papiro egizio con tutta la roba pertinente a quell’ID. Inoltre, non è sempre facile capire dove esattamente dovrebbe andare una nota. Mi sono quindi inventato una semplice variante che credo estenda in maniera molto consistente e robusta. In breve: ogni nota che non è un ID **deve** avere un link all’ID di riferimento. Per esempio:

```
# Leetle challenge
> Up: [[11.35 Brain training]]
> Location: [Web](https://leetle.app)
---

A small, daily programming challenge inspired by LeetCode and Wordle.
```

Questa nota è figlia dell’ID `11.35 Brain training` , a cui posso immediatamente risalire grazie al link. Fine. Non m’importa che gli ID coesistano con altre mille note, perché nessuna di queste note è davvero disconnessa dalle altre. È una versione ultralight dei link bi-direzionali di Obsidian.

Ora: perché questo pippone? Perché perdere tempo con una cosa già decisa—e cioè _una sola_ app a pagamento per le note? Perché l’abbonamento a Day One è scaduto, Everlog non mi piace del tutto (la parte UI/UX è mediocre), e non riesco a togliermi dalla testa l’idea che un journal plain text sia l’unica soluzione definitiva. Ma su questo dilemma ci ho ragionato già parecchio e non ho ancora trovata una soluzione abbastanza buona che mi abbia convinto.

Così un paio di giorni fa mi imbatto per caso in questo video su YouTube in cui l’autore presenta un “rivoluzionario” sistema per tenere un journal, sistema che chiama _Forever Diary_. L’app che usa è Apple Notes, fermo sostenitore che le app di default sono la soluzione che funziona nel 90% dei casi. Ne sono abbastanza convinto anch’io, ma nessuna di queste “soluzioni” può essere davvero universale.

Questo _Forever Diary_ cambia una piccola cosa, sostanziale: anziché tenere un journal per anno (o anche per più anni, come ho fatto io con Day One dal 2014), usiamo l’unità di tempo che ci interessa di più: il giorno. Sappiamo per certo che il 18 marzo si ripeterà ogni anno fino all fine del mondo—o meglio, fino a quando saremo in vita o finché manterremo il calendario Gregoriano attuale. Perciò, proprio come quei calendari che non mostrano il giorno della settimana (che cambia ogni anno), i giorni del journal diventano una collezione di ciò che abbiamo scritto negli anni passati o scriveremo in quelli futuri. È così semplice che mi sono detto: con tutto il tempo che ho passato a ragionare su un nuovo sistema, possibile che non mi sia venuta in mente questa idea?

Questo piccolo ma sostanziale cambiamento apre un sacco di prospettive. La più ovvia è che una delle feature di un’app come Day One diventa _built-in_: “On this day” è automatica, perché ci basta aprire il file `March 18.txt` (o la nota corrispondente) per avere la history completa di tutto ciò che abbiamo scritto.

Un file di plain text _bare_ è, appunto, bare. Il Markdown è la forma più light di testo semplice con qualche formattazione, ma come fare con le immagini? Come fare ad archiviare il tutto in maniera ordinata? L’idea sarebbe riuscire a integrare questo sistema con il JD system, perché _naturalmente_ fanno parte dello stesso universo.

Ho pensato di seguire il creatore di questo diario alternativo e usare Apple Notes, ma per quanto sia migliorata notevolmente, ha un paio di limiti che faccio fatica a digerire:

1. Rende inutilmente difficile esportare qualsiasi cosa. Solo in PDF, oppure ti tocca copiare a mano il contenuto o inventarti chissà quale workaround con Apple Script o altre robe da nerd. Stupido e inefficiente.
2. Il contenuto delle note è rich text, ossia l’opposto di plain text. Per formattare qualcosa, devi metterti a giocare con i bottoni come con Word, oppure impararti altre keyboard shortcut. Di nuovo: stupido, inefficiente e limitante.
3. La tipografia di una nota è fissa (e brutta, poco adatta a note con molto testo), a meno di non stare a perdere tempo con il rich text formatting. E così si torna al punto 2.

Ecco che Bear rientra dalla finestra e rende i $30 all’abbonamento annuale veramente ben spesi. Forse, non sono ancora sicuro. Ha praticamente tutte le feature che desidero, oltre a essere un’app elegante, minimale, e curata in tutti i dettagli. Il contenuto delle note è 100% Markdown e permette di esportare (o copiare) una nota in qualsiasi formato: plain text, rich text, HTML, PDF, ePub. Non è un’app per iOS adattata alla bell’e meglio, o un clone abborracciato di Day One (con feature inutili come degli AI prompt, che a questo punto non fa mai male aggiungere ovunque, giusto?). Mi sono convinto che Bear sia lo step più naturale da dei file plain text, come quello di iA Writer in cui sto scrivendo queste parole proprio ora. È praticamente istantaneo convertire una nota in Bear in un _vero_ file di testo, con la garanzia definitiva che non ci saranno problemi di migrare altrove. Chi mi garantisce che ciò valga anche Apple Notes?

Alcune cose di un’app come Day One non sono “trasferibili”, e non credo lo potranno mai essere in un sistema basato su plain text/Markdown:

- Una mappa interattiva dei luoghi
- Un sistema di filtering per luogo o topic (o tag)
