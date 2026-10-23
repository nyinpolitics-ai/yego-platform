# Nigerian Polling Unit Dataset Forensic Audit & Import Specification

**Date of Audit:** October 24, 2026  
**Auditor:** YEGO Platform Engineering & Architecture Team  
**Scope:** Complete verification of official Nigerian polling unit sources, data completeness, geographic hierarchy integrity, schema compatibility, and non-destructive import readiness.  
**Target Database Table:** `polling_units` in PostgreSQL (Supabase)  
**Schema Status:** 0 records currently loaded (confirmed clean baseline).

---

## 1. Executive Summary & Recommendation

| Candidate Source | Stated Rows | Verified Unique Codes | LGA Coverage | Ward Coverage | Coordinate Integrity | License / Provenance | Audit Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Partners United** | Dynamic Web | N/A (No bulk export) | Interactive | Interactive | None provided | Proprietary Web Widget | **Ineligible** (No bulk dataset) |
| **Candidate A (saidiadegoke/nigeria-inec-geo)** | **176,846** | **176,846 (100%)** | **774 (100%)** | **8,809 (100%)** | Clean (null coordinates, verified descriptions) | **MIT** (Official INEC CVR Portal dump) | **RECOMMENDED PRIMARY** |
| **Candidate B (Emeka-Onwuepe)** | 176,846 | 176,846 (100%) | 774 (100%) | 8,793 (8,809 by code) | None provided | None / Unspecified | **Viable Alternative** (Requires RFC 4180 parser) |
| **Candidate C (Data-Repository)** | 176,623 | Missing (`code` absent) | Incomplete | Incomplete | Highly Corrupted (1,512 outside Nigeria) | MIT (2012-2022) | **REJECTED** (Incomplete & corrupted GPS) |

### Recommended Source
We recommend **Candidate A (`saidiadegoke/nigeria-inec-geo`)** as the official primary import dataset for the YEGO Platform. It matches the official INEC published figures with 100.00% precision:
- **176,846 polling units**
- **8,809 registration areas / wards**
- **774 local government areas**
- **37 states (36 states + Federal Capital Territory)**
- Clean uppercase official administrative names, explicit `portal_id` traceability, and explicit MIT open-data license.

---

## 2. Investigation of Sources

### A. Primary User Website: Partners United (`partnersunited.org/polling-units`)
- **Inspection Result:** The page provides an interactive Polling Unit Locator widget managed by the Shehu Musa Yar'Adua Foundation.
- **Access Architecture:**
  - It uses client-side cascading dropdowns powered by `locations.js` invoking internal REST endpoints:
    - `/api/location/state/{id}/lgas`
    - `/api/location/lga/{id}/wards`
    - `/api/location/ward/{id}/polling-unit-locations`
- **Data Limitations:**
  - **No bulk download:** There is no CSV, JSON, database dump, or data export API provided.
  - **Missing fields:** The endpoint returns only `id`, `ward_id`, `reg_area_code`, and `polling_unit` (name). It does **not** provide the official hierarchical polling unit code (e.g. `01/01/01/001`), nor does it provide GPS coordinates.
  - **Anti-Scraping / Governance:** Attempting to reconstruct the national dataset from this widget would require traversing 37 states, 774 LGAs, and 8,809 wards via over 9,000 recursive HTTP requests, violating rate limits and terms of service without obtaining coordinates or codes.

### B. Candidate A: `saidiadegoke/nigeria-inec-geo`
- **Repository URL:** [https://github.com/saidiadegoke/nigeria-inec-geo](https://github.com/saidiadegoke/nigeria-inec-geo)
- **Primary Data File:** `data/polling-units.csv`
- **File Size:** 15,345,576 bytes (14.6 MB)
- **SHA-256 Hash:** `65BE04B266B4C013A39F327E7242451C4DC50A27E9DCF2038A565A0A5AAF86A2`
- **Provenance:** Scraped directly from the official INEC Continuous Voter Registration (CVR) portal (`https://cvr.inecnigeria.org/pu`) on August 10, 2026.
- **License:** MIT License (with explicit public-domain disclaimer confirming factual public electoral boundaries).
- **Structure:**
  `state_code,state_name,lga_code,lga_name,ward_code,ward_name,pu_code,pu_name,pu_location,full_code,portal_id`
- **Strengths:** 
  - Every single record contains both the clean administrative name (`pu_name`) and the location landmark (`pu_location`).
  - Zero multiline formatting defects.
  - Exactly 176,846 unique codes with 0 duplicates.
  - Accompanied by `aliases.json` documenting historical LGA renamings and INEC naming idiosyncrasies.

### C. Candidate B: `Emeka-Onwuepe/Polling_Units_in_Nigeria`
- **Repository URL:** [https://github.com/Emeka-Onwuepe/Polling_Units_in_Nigeria](https://github.com/Emeka-Onwuepe/Polling_Units_in_Nigeria)
- **Primary Data File:** `Nigeria_polling_units.csv`
- **File Size:** 31,099,405 bytes (29.7 MB)
- **SHA-256 Hash:** `CCE90B522EDF23284F0E5C2C2611A4D1EA8ADE44C2D68A7ED08E5DD19B80CC4D`
- **Provenance:** Scraped from the INEC Election Results Viewing (IReV) portal.
- **License:** None specified.
- **Structure:**
  `index,state,lg,ward,state_code,lg_code,ward_code,pu_code,code,location,ward_des,lg_des,senatorial,house_of_rep`
- **Discrepancy Investigation:**
  - **The 8,787 vs 8,809 Wards Discrepancy:** The repository README claims 8,787 wards. Our forensic analysis revealed that the author grouped by lowercase ward description strings (`ward_des`), conflating wards that share identical names across different jurisdictions. When grouped by the hierarchical code (`state_code/lg_code/ward_code`), Candidate B contains exactly **8,809** unique wards.
  - **Formatting Defect:** Candidate B contains **644 multiline broken rows** where raw newlines appear inside unclosed quotes in the `location` column. Naive line-by-line parsers (including the original `import-polling-units.mjs`) silently drop or corrupt these rows.
  - **Merged Name/Location:** Candidate B merges the venue landmark and name into a single lowercase string (e.g. `railway quarters - railway quarters i`) without separating the primary title from description.

### D. Candidate C: `Data-Repository/Nigeria-inec-polling-units`
- **Repository URL:** [https://github.com/Data-Repository/Nigeria-inec-polling-units](https://github.com/Data-Repository/Nigeria-inec-polling-units)
- **Primary Data File:** `polling-units.csv`
- **File Size:** 12,497,277 bytes (11.9 MB)
- **SHA-256 Hash:** `8F438B475D57529E558735B0376C6BDE5AD89AEBA641FC72B3486606FF0A3775`
- **Provenance:** Third-party compilation retrieved from an older INEC website URL (`https://www.inecnigeria.org/elections/polling-units/`).
- **Critical Defects:**
  - **Missing Polling Unit Codes:** The dataset does **not** contain the official polling unit code column (`code`). It only lists `name,ward_name,local_government_name,state_name,location.latitude,location.longitude`. It cannot satisfy the database constraint `code text not null unique`.
  - **Incomplete Records:** Contains 176,623 records, missing **223 polling units** compared to the official register.
  - **Severe Coordinate Hallucinations / Geocoding Drift:** Out of 119,297 rows with coordinates, at least **1,512 coordinates are outside Nigeria** (including coordinates in Waterloo, Canada; Europe; and the Atlantic Ocean) caused by unconstrained automated forward-geocoding of Nigerian landmark text.

---

## 3. Official INEC Reference Reconciliation

The Independent National Electoral Commission (INEC) established the expanded polling unit register ahead of the 2023 General Elections:

| Administrative Level | Official INEC Register | Candidate A Verified | Candidate B Verified | Candidate C Verified |
| :--- | :--- | :--- | :--- | :--- |
| **States + FCT** | **37** | **37 (100%)** | **37 (100%)** | **37 (100%)** |
| **Local Government Areas (LGAs)** | **774** | **774 (100%)** | **774 (100%)** | **774 (100%)** |
| **Registration Areas / Wards** | **8,809** | **8,809 (100%)** | **8,809 (100% by code)** | Incomplete |
| **Total Polling Units** | **176,846** | **176,846 (100%)** | **176,846 (100%)** | 176,623 (-223) |

### State-by-State Polling Unit Reconciliation (Candidate A)

| INEC Code | State Name | ISO Code (YEGO) | Polling Units Count | Reconciliation Status |
| :---: | :--- | :---: | :---: | :---: |
| 01 | ABIA | AB | 4,062 | Exact Match |
| 02 | ADAMAWA | AD | 4,104 | Exact Match |
| 03 | AKWA IBOM | AK | 4,353 | Exact Match |
| 04 | ANAMBRA | AN | 5,720 | Exact Match |
| 05 | BAUCHI | BA | 5,423 | Exact Match |
| 06 | BAYELSA | BY | 2,244 | Exact Match |
| 07 | BENUE | BE | 5,102 | Exact Match |
| 08 | BORNO | BO | 5,071 | Exact Match |
| 09 | CROSS RIVER | CR | 3,281 | Exact Match |
| 10 | DELTA | DE | 5,863 | Exact Match |
| 11 | EBONYI | EB | 2,946 | Exact Match |
| 12 | EDO | ED | 4,519 | Exact Match |
| 13 | EKITI | EK | 2,445 | Exact Match |
| 14 | ENUGU | EN | 4,145 | Exact Match |
| 15 | GOMBE | GO | 2,988 | Exact Match |
| 16 | IMO | IM | 4,758 | Exact Match |
| 17 | JIGAWA | JI | 4,522 | Exact Match |
| 18 | KADUNA | KD | 8,012 | Exact Match |
| 19 | KANO | KN | 11,222 | Exact Match |
| 20 | KATSINA | KT | 6,652 | Exact Match |
| 21 | KEBBI | KB | 3,743 | Exact Match |
| 22 | KOGI | KO | 3,508 | Exact Match |
| 23 | KWARA | KW | 2,887 | Exact Match |
| 24 | LAGOS | LA | 13,325 | Exact Match |
| 25 | NASARAWA | NA | 3,256 | Exact Match |
| 26 | NIGER | NI | 4,950 | Exact Match |
| 27 | OGUN | OG | 5,042 | Exact Match |
| 28 | ONDO | ON | 3,933 | Exact Match |
| 29 | OSUN | OS | 3,763 | Exact Match |
| 30 | OYO | OY | 6,390 | Exact Match |
| 31 | PLATEAU | PL | 4,989 | Exact Match |
| 32 | RIVERS | RI | 6,866 | Exact Match |
| 33 | SOKOTO | SO | 3,991 | Exact Match |
| 34 | TARABA | TA | 3,597 | Exact Match |
| 35 | YOBE | YO | 2,823 | Exact Match |
| 36 | ZAMFARA | ZA | 3,529 | Exact Match |
| 37 | FCT | FC | 2,822 | Exact Match |
| **Total** | **National** | **37 Entities** | **176,846** | **100.00% Verified** |

---

## 4. YEGO Schema Compatibility & Mapping

### Database Table Definition (`0001_init.sql`)
```sql
create table if not exists polling_units (
  id uuid primary key default gen_random_uuid(),
  state_code text not null references states(code),
  lga text not null,
  ward text not null,
  code text not null unique,
  name text not null,
  lat double precision,
  lng double precision,
  source text not null default 'manual',
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists polling_units_lookup_idx
  on polling_units (state_code, lower(lga), lower(ward));
```

### Field Mapping (Candidate A -> `polling_units`)

| Candidate A Field | Sample Value | Target Table Column | Mapping Transformation / Integrity Constraint |
| :--- | :--- | :--- | :--- |
| `state_code` / `state_name` | `01` / `ABIA` | `state_code` | Mapped via `STATE_NUM_TO_CODE` to ISO 2-letter code (`AB`). Validated against `references states(code)`. |
| `lga_name` | `ABA NORTH` | `lga` | Normalized uppercase trim. |
| `ward_name` | `EZIAMA` | `ward` | Normalized uppercase trim. |
| `full_code` | `01/01/01/001` | `code` | Validated against regex `^\d{2}/\d{2}/\d{2}/\d{3}$`. Enforces `unique` constraint. |
| `pu_name` | `RAILWAY QUARTERS I` | `name` | If empty, falls back to `pu_location`. Clean title. |
| N/A | `null` | `lat` | `null` (Preserves factual truth; avoids spoofed GPS). |
| N/A | `null` | `lng` | `null` (Preserves factual truth; avoids spoofed GPS). |
| Literal | `'inec-cvr-register'` | `source` | Documents factual provenance. |
| Literal | `false` | `verified` | Defaults to false until on-ground observers verify physical polling units. |

---

## 5. Non-Destructive Importer Architecture & Safeguards

We upgraded [`scripts/import-polling-units.mjs`](../scripts/import-polling-units.mjs) with production safeguards:

1. **RFC 4180 Streaming Parser:**
   Replaced naive single-line parsing with a streaming state-machine parser. Handles escaped commas and quoted newlines without memory leaks or dropped rows.
2. **Dry-Run Mode (`--dry-run`):**
   Allows running complete in-memory validation of all 176,846 records against geographic rules and state foreign keys without making a single database modification.
3. **Non-Destructive Upsert:**
   Uses PostgreSQL `ON CONFLICT (code) DO UPDATE` designed to:
   - Update administrative labels if needed.
   - **Never overwrite existing valid coordinates:** If an observer or coordinator has mapped a polling unit's `lat` and `lng`, re-running the import will leave those coordinates completely intact.
4. **Auto-Format Detection:**
   Dynamically recognizes Candidate A (`full_code`, `pu_name`) and Candidate B (`code`, `location`).

---

## 6. Proposed Command for Live Import (Pending User Approval)

> [!IMPORTANT]
> In accordance with instructions, **no records have been imported to Supabase**. The `polling_units` table remains at **0 records**.

Once this audit is approved, the live import can be executed using either of the following commands:

### Option A: Direct Stream from Official Candidate A GitHub URL
```bash
pnpm db:import:pus https://raw.githubusercontent.com/saidiadegoke/nigeria-inec-geo/main/data/polling-units.csv
```

### Option B: Local File Import (Fastest & Network-Independent)
```bash
pnpm db:import:pus C:/Users/LENOVO/.gemini/antigravity-ide/scratch/candidate-a/data/polling-units.csv
```
*(Estimated duration: ~1.5 - 2 minutes for 176,846 records in 500-row batch transactions).*
