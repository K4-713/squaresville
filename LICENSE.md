# License

The Squaresville source code is dedicated to the public domain under
**CC0 1.0 Universal**. To the extent possible under law, the author has waived
all copyright and related or neighboring rights to this work. Full text:
creativecommons.org/publicdomain/zero/1.0/

Third-party components below are **not** covered by the CC0 dedication; they
remain under their own licenses.

## Third-party components

Every third-party dependency vendored into or referenced by this project is
credited here (see the `dependency-change` workflow).

### write-excel-file (library, bundled with fflate)
- **What:** `vendor/write-excel-file-4.1.1.min.js` — the self-contained browser
  bundle of write-excel-file v4.1.1, which includes its single dependency,
  fflate, compiled in
- **Authors:** write-excel-file © 2018 catamphetamine (gitlab.com/catamphetamine);
  fflate © Arjun Barrett
- **Source:** npmjs.com/package/write-excel-file (bundle path `bundle/write-excel-file.min.js`)
- **Licenses:** MIT (both write-excel-file and fflate)
- **Use:** generates the final pattern spreadsheet (.xlsx) entirely in the
  browser, vendored locally so no external origin is contacted at runtime
  (ED-1/ED-4)
- **Added:** 2026-07-03

### Delius (font)
- **What:** `fonts/delius-latin.woff2` — Latin subset, WOFF2
- **Author:** Natalia Raices
- **Source:** Google Fonts (fonts.google.com/specimen/Delius)
- **License:** SIL Open Font License 1.1 (openfontlicense.org)
- **Use:** UI typeface, vendored locally so no external origin is contacted at
  runtime (ED-1/ED-4)
- **Added:** 2026-07-03 (replaced Patrick Hand, same license, removed same day)
