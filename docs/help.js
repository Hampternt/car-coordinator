'use strict';
/* What each ⓘ says. A key per ⓘ, drawn by infoBtn(key) in app.js: a title,
   then one or two short sentences, first what the part is, then how to use
   it. The words are the ones on screen, exactly as the screen writes them,
   and never a code word. A key with no ⓘ, or an ⓘ with no key, fails the
   smoke test.

   Only HELP is declared at the top level: this loads as a classic script
   beside app.js, and a top-level name of its own could clash with app.js's
   and stop the app from starting. */
const HELP = {
  // ---------- Day plan ----------
  'plan-date': { title: 'The date',
    text: 'The date printed at the top of the sheet, normally the next working day. The line under it says when it is not and offers Set to tomorrow; a passed date moved forward when the app opened can be put back with Keep.' },
  'plan-warnings': { title: 'Routes to look at',
    text: 'A car on two routes, a spot taken twice in one round, or a car or spot with a status label on a route. Nothing is ever blocked, since sometimes it is meant, and none of this goes on the printed sheet.' },
  'plan-routes': { title: 'The routes',
    text: 'Each row is one line of the sheet on the pillar: the route, its driver, car, position and round. Mark prints the row pink and Gap leaves a blank line above it; drag a name in from the Drivers or Cars panel, or right-click a row for everything else it can do.' },
  'plan-drivers': { title: 'The Drivers panel',
    text: 'Everyone on the roster: ✓ is in, ↺ is away, and each name shows its usual days and where it is today. All puts everyone in and a crew\'s button puts exactly that crew in; drag a name onto a route to put them on it.' },
  'plan-cars': { title: 'The Cars panel',
    text: 'The fleet, each car with its route, Free, or its status label. Drag a registration onto a route to put it there; 🏷 or a right-click sets its status.' },
  'plan-templates': { title: 'Day templates',
    text: 'Saved copies of the routes, with their drivers, cars, positions, rounds and marks, but never the date. Update from plan fills a template with the plan on screen; loading one asks which parts to take and says what will happen before anything changes.' },
  'plan-week': { title: 'The week',
    text: 'Monday to Friday, each with its crew: the drivers whose usual days include it. Load makes that crew the ones in and everyone else away; a day with no crew can save the drivers in now as its crew.' },
  'plan-map': { title: 'Parking map',
    text: 'The yard as it is laid out, with the routes packed at each spot, round by round. It finds Spot 1 to Spot 5 and the gate by name; a spot taken twice in one round turns red, and positions it does not know are listed under Not on the map.' },

  // ---------- Drivers ----------
  'drivers-days': { title: 'Usual days',
    text: 'The weekdays a driver usually works. A tick puts them in that day\'s group under Day groups, which is the day\'s crew in the week on the Day plan.' },
  'drivers-tags': { title: 'Tag and note',
    text: 'A driver tag says why someone is off, such as Sick, Holiday or Course, and the note says the rest, such as back Monday. Driver tags are made on the Labels tab, apart from the car labels, and a tag never sets anyone Away.' },
  'drivers-groups': { title: 'Day groups',
    text: 'A named set of drivers, such as a Monday crew or a weekend crew. Name one after a weekday to make it that day\'s crew; Use for today makes exactly those drivers the ones in.' },

  // ---------- Cars ----------
  'cars-assigned': { title: 'Assigned to',
    text: 'Where each car is on the day plan: the route it is on, or Not assigned.' },
  'cars-status': { title: 'Status and note',
    text: 'Click a label to mark a car, such as Workshop or Out of service, and OK to clear it; the note says the rest. A marked car can still be picked, but the plan warns about it, and a label with Show on printout ticked lists the parked car on the printed sheet.' },

  // ---------- Positions ----------
  'positions-map': { title: 'Positions',
    text: 'The packing spots, the garage and any ports a route can be packed at. The parking map on the Day plan finds Spot 1 to Spot 5 and the gate by name, so a renamed spot moves to the list under the map.' },
  'positions-many': { title: 'Many cars',
    text: 'Ticked, several routes can share the position in the same round, as the Garage does, without a warning. Unticked, a second route there in the same round is listed under the routes to look at.' },
  'positions-status': { title: 'Status and note',
    text: 'Click a label to mark a position, such as closed for resurfacing, and OK to clear it. A marked position can still be picked, but the plan warns about it.' },

  // ---------- Labels ----------
  'labels-labels': { title: 'Car and position labels',
    text: 'The one-click status buttons on cars and positions. Tick Show on printout to list a label\'s parked cars under Cars not available on the printed sheet.' },
  'labels-driver-tags': { title: 'Driver tags',
    text: 'The tags on the Drivers tab and in a driver\'s tag menu, a list of their own. They are never printed and never sent in a share code.' },

  // ---------- Data ----------
  'data-file': { title: 'Auto-save to a file',
    text: 'Everything is kept in this browser; a save file on OneDrive, a network drive or a stick keeps a second copy of every change outside it. After a restart the card asks to Reconnect, and on a new PC Open an existing file brings the plan back.' },
  'data-colours': { title: 'Colours',
    text: 'Follow the computer, Light or Dark, for this browser only. The printed sheet looks the same whichever you pick.' },
  'data-share': { title: 'Sending the list',
    text: 'Copy the day plan turns the list into a code to paste into a chat or an email; nothing is uploaded, the code is the list. The other PC pastes it under Load a list someone sent you and sees what it holds before anything changes.' },
  'data-copy': { title: 'Your own copy',
    text: 'Export a copy saves everything as one file you can keep, email or put on a stick. Import a copy puts a file like that back, after a backup of what is on screen.' },
  'data-news': { title: 'What\'s new',
    text: 'What changed in each version of the app, newest first. After an update the same words show once at the top of the page.' },
  'data-archives': { title: 'Archives',
    text: 'An untouched copy of everything as it was just before each update, kept in this browser. Restore puts it back, after a backup of what is on screen, and Download keeps it as a file.' },
  'data-backups': { title: 'Backups',
    text: 'Taken before anything is cleared or deleted, and once at the start of each day; the last 12 are kept in this browser. Restore puts one back, after a backup of what is on screen.' },

  // ---------- Print preview ----------
  'preview': { title: 'What is on the paper',
    text: 'Exactly what gets printed: the date with its weekday, the routes with their drivers, cars and packing, and the free cars. Print / save PDF opens the print dialog, where Microsoft Print to PDF makes a file.' },
};
