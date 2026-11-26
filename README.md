# Ciśnienie – dziennik pomiarów

Prosta i ładna aplikacja do zapisywania pomiarów ciśnienia krwi i tętna. Działa na iPhonie, Androidzie i komputerze, instaluje się jak zwykła aplikacja (ikona na ekranie) i działa bez internetu. Każdy użytkownik ma własne konto: swoje pomiary, swoje kopie i swoje przypomnienia.

Adres po publikacji: `https://lewym90.github.io/moje-cisnienie/`

## Co potrafi

- **Start**: ostatni pomiar (ciśnienie, puls, kategoria), przycisk „Dodaj pomiar”, kafelki Statystyki / Historia / Przypomnienia / Porady, „Kolejny pomiar” z przełącznikiem przypomnień, stan dnia (rano / wieczorem) i ostatnie pomiary.
- **Dodaj pomiar**: skurczowe, rozkurczowe i puls – wpisujesz z klawiatury (pełna liczba sama przechodzi do następnego pola) albo przyciskami − / + (przytrzymanie przyspiesza; puste pole startuje od ostatniego pomiaru). Data i godzina (domyślnie teraz, można zmienić), notatka, okoliczności (przed lekami, po lekach, nieregularne bicie, po wysiłku, stres, po kawie, ból głowy, złe samopoczucie) i ręka (zapamiętywana). Od razu widać kategorię wyniku.
- **Bezpieczeństwo wpisów**: odrzuca niemożliwe wartości (np. dolne wyższe od górnego, pomiar z przyszłości), pyta przy nietypowym wyniku (literówka?), przy ≥180/110 pokazuje, co zrobić i kiedy dzwonić pod 112. Każdą zmianę i usunięcie można cofnąć.
- **Pomiary (historia)**: miesiąc po miesiącu, z podziałem na dni, średnią miesiąca, liczbą pomiarów w celu i raportem z miesiąca.
- **Statystyki**: Tydzień / Miesiąc / 3 miesiące / Rok – średnie, wykres skurczowego i rozkurczowego, główny wniosek („Stabilne wartości”, „Ciśnienie spada” …), tętno, rano i wieczorem, kategorie pomiarów, wnioski słowne i **raport dla lekarza** (druk / PDF).
- **Tydzień pomiarów przed wizytą**: 7 dni, rano i wieczorem po 2 pomiary; aplikacja prowadzi dzień po dniu i liczy średnią z dni 2–7 (tak jak zalecają wytyczne), z osobnym raportem dla lekarza.
- **Kategorie** według wytycznych ESH 2023. Domyślny cel 135/85 (granica dla pomiarów domowych), do zmiany w Profilu, jeśli lekarz ustalił inny.
- **Konto dla każdego**: własne pomiary, kopie i przypomnienia (rano i wieczorem, tylko gdy nie było świeżego pomiaru).
- **Dane**: kopia JSON, eksport CSV (Excel), import JSON i CSV bez dublowania, jasny i ciemny motyw.

Aplikacja jest dzienniczkiem. Nie stawia diagnozy i nie zastępuje lekarza.

## Publikacja (GitHub Pages)

1. Repozytorium `moje-cisnienie` → **Settings** → **Pages**.
2. W „Build and deployment” → **Source**: „Deploy from a branch”, **Branch**: `main`, folder `/ (root)` → **Save**.
3. Po 1–2 minutach aplikacja działa pod `https://lewym90.github.io/moje-cisnienie/`.

## Instalacja na telefonie

| Urządzenie | Jak zainstalować |
| --- | --- |
| iPhone | Otwórz adres w **Safari** → Udostępnij (kwadrat ze strzałką) → **Do ekranu początkowego** → **Dodaj** |
| Android | Chrome → menu (⋮) → **Zainstaluj aplikację** |
| Komputer | Chrome / Edge → ikona instalacji w pasku adresu |

## Konta, kopie i przypomnienia (serwer)

Każdy użytkownik zakłada w aplikacji **własne konto** (login + hasło) i widzi **tylko swoje** pomiary, swoje kopie i swoje przypomnienia. Konto działa na wielu urządzeniach – wystarczy zalogować się tym samym loginem.

Wszystko robi serwer `serwer/cisnienie.mjs` na VPS (obok innych aplikacji, adres `https://188-68-247-201.sslip.io/cisnienie-api`):

- konta (hasła scrypt, blokada zgadywania), sesje na urządzeniach,
- pomiary każdego konta zaszyfrowane AES-256-GCM (klucz w `/etc/cisnienie/klucz`, poza bazą),
- scalanie danych z kilku urządzeń (ta sama logika co w aplikacji, `js/core.js`),
- kopia całej bazy codziennie, 30 ostatnich dni (`/var/lib/cisnienie/kopie`),
- przypomnienia push co minutę według godzin i strefy czasowej każdego użytkownika (własna implementacja Web Push, bez bibliotek).

Nowe konto da się założyć tylko z **kodem zaproszenia** – ustawia go administrator na serwerze.

### Instalacja serwera (jednorazowo, jako root)

```
curl -fsSL https://raw.githubusercontent.com/lewym90/moje-cisnienie/main/serwer/install.sh | bash
```

Skrypt na końcu poprosi o kod zaproszenia. Ten sam wiersz aktualizuje serwer (konta i pomiary zostają).

### Polecenia administratora

| Polecenie | Co robi |
| --- | --- |
| `cisnienie-kod` | pokazuje albo zmienia kod zaproszenia |
| `cisnienie-konta` | lista kont |
| `cisnienie-konta reset LOGIN` | nowe hasło dla osoby, która zapomniała (pomiary zostają) |
| `cisnienie-konta usun LOGIN` | usuwa konto razem z pomiarami |

Sprawdzenie: `curl -s https://188-68-247-201.sslip.io/cisnienie-api/zdrowie`

## Dla programisty

Zwykłe pliki (HTML, CSS, JavaScript), bez budowania. Podgląd: `node tools/serve.js` → http://localhost:8080. Testy (aplikacja + serwer, Node 24): `npm install`, potem `npm test`.

Nowa wersja aplikacji: zwiększ `VERSION` w `sw.js` i `APP_VERSION` w `js/app.js`. Nowa wersja serwera: `WERSJA` w `serwer/cisnienie.mjs`, potem na serwerze ten sam wiersz instalacji.

```
index.html               szkielet
css/style.css            wygląd (jasny / ciemny)
css/report.css           raporty do druku
js/core.js               logika: wartości, kategorie ESH, statystyki, scalanie, CSV (testowana, bez DOM)
js/store.js              zapis na urządzeniu (localStorage + IndexedDB)
js/sync.js               konto i synchronizacja z serwerem
js/app.js                interfejs
sw.js                    tryb offline i powiadomienia
serwer/cisnienie.mjs     serwer: konta, zaszyfrowane dane, kopie, przypomnienia push
serwer/admin.mjs         polecenia administratora
serwer/install.sh        instalacja / aktualizacja serwera
tests/                   testy automatyczne
```
