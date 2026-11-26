# Ciśnienie – dziennik pomiarów

Prosta i ładna aplikacja do zapisywania pomiarów ciśnienia krwi i tętna. Działa na iPhonie, Androidzie i komputerze, instaluje się jak zwykła aplikacja (ikona na ekranie), działa bez internetu, a po każdym pomiarze może wysłać kopię do Twojego **prywatnego** repozytorium GitHub.

Adres po publikacji: `https://lewym90.github.io/moje-cisnienie/`

## Co potrafi

- **Start**: ostatni pomiar (ciśnienie, puls, kategoria), przycisk „Dodaj pomiar”, kafelki Statystyki / Historia / Przypomnienia / Porady, „Kolejny pomiar” z przełącznikiem przypomnień, stan dnia (rano / wieczorem) i ostatnie pomiary.
- **Dodaj pomiar**: skurczowe, rozkurczowe i puls – wpisujesz z klawiatury (pełna liczba sama przechodzi do następnego pola) albo przyciskami − / + (przytrzymanie przyspiesza; puste pole startuje od ostatniego pomiaru). Data i godzina (domyślnie teraz, można zmienić), notatka, okoliczności (przed lekami, po lekach, nieregularne bicie, po wysiłku, stres, po kawie, ból głowy, złe samopoczucie) i ręka (zapamiętywana). Od razu widać kategorię wyniku.
- **Bezpieczeństwo wpisów**: odrzuca niemożliwe wartości (np. dolne wyższe od górnego, pomiar z przyszłości), pyta przy nietypowym wyniku (literówka?), przy ≥180/110 pokazuje, co zrobić i kiedy dzwonić pod 112. Każdą zmianę i usunięcie można cofnąć.
- **Pomiary (historia)**: miesiąc po miesiącu, z podziałem na dni, średnią miesiąca, liczbą pomiarów w celu i raportem z miesiąca.
- **Statystyki**: Tydzień / Miesiąc / 3 miesiące / Rok – średnie, wykres skurczowego i rozkurczowego, główny wniosek („Stabilne wartości”, „Ciśnienie spada” …), tętno, rano i wieczorem, kategorie pomiarów, wnioski słowne i **raport dla lekarza** (druk / PDF).
- **Tydzień pomiarów przed wizytą**: 7 dni, rano i wieczorem po 2 pomiary; aplikacja prowadzi dzień po dniu i liczy średnią z dni 2–7 (tak jak zalecają wytyczne), z osobnym raportem dla lekarza.
- **Kategorie** według wytycznych ESH 2023. Domyślny cel 135/85 (granica dla pomiarów domowych), do zmiany w Profilu, jeśli lekarz ustalił inny.
- **Przypomnienia** rano i wieczorem o wybranych godzinach – tylko wtedy, gdy nie było świeżego pomiaru.
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

## Kopia bezpieczeństwa (prywatne repozytorium)

Dane o zdrowiu trafiają do **osobnego, prywatnego** repozytorium – aplikacja odmawia połączenia z publicznym.

1. https://github.com/new → nazwa `cisnienie-dane` → **Private** → zaznacz „Add a README file” → **Create repository**.
2. https://github.com/settings/personal-access-tokens/new → nazwa np. „Dane ciśnienia”, najdłuższy czas ważności → **Only select repositories** → `cisnienie-dane` → Repository permissions: **Contents: Read and write** oraz **Workflows: Read and write** → **Generate token**.
3. W aplikacji: **Profil → Kopia bezpieczeństwa**: wpisz `lewym90/cisnienie-dane`, wklej token → „Połącz i wyślij kopię”. Na drugim urządzeniu to samo.

Po każdym pomiarze dane z urządzenia i z GitHuba są scalane (wygrywa nowsza wersja każdego pomiaru, usunięcia też się synchronizują) i zapisywane jako osobny commit – historia zmian jest pełna.

## Przypomnienia (powiadomienia na telefonie)

Przypomnienia wysyła zadanie GitHub Actions w Twoim prywatnym repozytorium z danymi. Jednorazowo:

1. Repozytorium `cisnienie-dane` → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Name: `VAPID_PRIVATE_KEY`, Secret: klucz prywatny (dostajesz go ode mnie w czacie) → **Add secret**.
2. Na iPhonie aplikacja musi być dodana do ekranu początkowego (iOS 16.4+). W aplikacji: **Profil → Przypomnienia o pomiarze** → wybierz godziny → „Włącz przypomnienia”. Aplikacja sama doda zadanie `.github/workflows/przypomnienia.yml` do repozytorium z danymi.
3. Test: `cisnienie-dane` → **Actions** → „Przypomnienia o pomiarze” → **Run workflow** → zaznacz „Wyślij próbne powiadomienie” → **Run workflow**.

Zadanie startuje co godzinę (7 minut po pełnej godzinie, GitHub potrafi je opóźnić), więc przypomnienie przychodzi zwykle w ciągu kilkunastu minut od ustawionej godziny. Wysyła je tylko, gdy od 2 godzin przed tą godziną nie było pomiaru, i najwyżej raz dziennie dla każdej pory. Treść nie zawiera wyników. Jedno uruchomienie trwa kilka sekund (prywatne repozytorium ma 2000 darmowych minut miesięcznie – wystarczy z dużym zapasem). GitHub wyłącza zaplanowane zadania po 60 dniach bez żadnych zmian w repozytorium; regularne pomiary temu zapobiegają.

## Dla programisty

Zwykłe pliki (HTML, CSS, JavaScript), bez budowania. Podgląd: `node tools/serve.js` → http://localhost:8080. Testy: `npm install`, potem `npm test`.

Nowa wersja: zwiększ `VERSION` w `sw.js` i `APP_VERSION` w `js/app.js`.

```
index.html               szkielet
css/style.css            wygląd (jasny / ciemny)
css/report.css           raporty do druku
js/core.js               logika: wartości, kategorie ESH, statystyki, scalanie, CSV (testowana, bez DOM)
js/store.js              zapis na urządzeniu (localStorage + IndexedDB)
js/sync.js               kopia i synchronizacja z GitHub, zadanie przypomnień
js/app.js                interfejs
sw.js                    tryb offline i powiadomienia
tools/remind.js          logika przypomnień (uruchamiana przez GitHub Actions)
tools/przypomnienia.yml  wzór zadania, które aplikacja dodaje do repozytorium z danymi
tests/                   testy automatyczne
```
