# Dynamic URL Routing for Delhi District Courts

## Overview
The scraper now supports dynamic URL routing based on the `courtName` parameter sent in the request payload. This allows the same scraper function to work with all Delhi District Courts without code changes.

## How It Works

### 1. Frontend Payload
The frontend sends a request with the `courtName` parameter:

```json
{
  "diaryNumber": "212",
  "year": "2022",
  "caseType": "CR Cases",
  "courtComplex": "Karkardooma Court Complex",
  "courtName": "Central District Court, Delhi"
}
```

### 2. URL Mapping
The scraper uses `DISTRICT_COURT_URLS` mapping in `browser.js`:

```javascript
const DISTRICT_COURT_URLS = {
    'central': 'https://centraldelhi.dcourts.gov.in',
    'central delhi': 'https://centraldelhi.dcourts.gov.in',
    'central district court, delhi': 'https://centraldelhi.dcourts.gov.in',
    
    'east': 'https://eastdelhi.dcourts.gov.in',
    'east delhi': 'https://eastdelhi.dcourts.gov.in',
    'east district court, delhi': 'https://eastdelhi.dcourts.gov.in',
    
    // ... more courts
};
```

### 3. Dynamic Navigation
The `navigateToCaseNumberPage()` function:
1. Receives `courtName` parameter
2. Calls `getCourtBaseUrl(courtName)` to get the base URL
3. Constructs the full URL: `${baseUrl}/case-status-search-by-case-number/`
4. Navigates to the correct court website

### 4. Flow Diagram

```
Frontend Payload
    ↓
index.js (receives courtName)
    ↓
districtCourtScrapper.js (validates courtName)
    ↓
scraper.js (passes courtName to navigation)
    ↓
browser.js (maps courtName → URL → navigates)
```

## Supported Courts

### Delhi District Courts
- **East Delhi**: eastdelhi.dcourts.gov.in
- **Central Delhi**: centraldelhi.dcourts.gov.in
- **West Delhi**: westdelhi.dcourts.gov.in
- **North Delhi**: northdelhi.dcourts.gov.in
- **South Delhi**: southdelhi.dcourts.gov.in
- **Northeast Delhi**: northeastdelhi.dcourts.gov.in
- **Northwest Delhi**: northwestdelhi.dcourts.gov.in
- **Southeast Delhi**: southeastdelhi.dcourts.gov.in
- **Southwest Delhi**: southwestdelhi.dcourts.gov.in
- **Shahdara**: shahdara.dcourts.gov.in
- **Rohini**: rohini.dcourts.gov.in
- **Dwarka**: dwarka.dcourts.gov.in

## Court Name Formats

The system accepts multiple formats for court names (case-insensitive):

### Examples for Central Delhi:
- `"central"`
- `"Central Delhi"`
- `"central district court, delhi"`
- `"Central District Court, Delhi"`

### Examples for East Delhi:
- `"east"`
- `"East Delhi"`
- `"east district court, delhi"`
- `"East District Court, Delhi"`

## Error Handling

If an invalid court name is provided, the scraper will throw an error:

```
Court "Invalid Court Name" not found in URL mapping. 
Available courts: https://eastdelhi.dcourts.gov.in, https://centraldelhi.dcourts.gov.in, ...
```

## Request Examples

### Central Delhi Court
```json
POST /fetchEastDelhiDistrictJudgments
{
  "courtName": "Central District Court, Delhi",
  "diaryNumber": "212",
  "year": "2022",
  "caseType": "CR Cases",
  "courtComplex": "Tis Hazari Court Complex"
}
```
→ Navigates to: `https://centraldelhi.dcourts.gov.in/case-status-search-by-case-number/`

### East Delhi Court
```json
POST /fetchEastDelhiDistrictJudgments
{
  "courtName": "East District Court, Delhi",
  "diaryNumber": "212",
  "year": "2022",
  "caseType": "CR Cases",
  "courtComplex": "Karkardooma Court Complex"
}
```
→ Navigates to: `https://eastdelhi.dcourts.gov.in/case-status-search-by-case-number/`

### West Delhi Court
```json
POST /fetchEastDelhiDistrictJudgments
{
  "courtName": "West District Court, Delhi",
  "diaryNumber": "100",
  "year": "2023",
  "caseType": "BA",
  "courtComplex": "Dwarka Court Complex"
}
```
→ Navigates to: `https://westdelhi.dcourts.gov.in/case-status-search-by-case-number/`

## Adding New Courts

To add support for a new court, update `DISTRICT_COURT_URLS` in `browser.js`:

```javascript
const DISTRICT_COURT_URLS = {
    // ... existing courts
    
    'newcourt': 'https://newcourt.dcourts.gov.in',
    'new court delhi': 'https://newcourt.dcourts.gov.in',
    'new district court, delhi': 'https://newcourt.dcourts.gov.in',
};
```

No other code changes are required!

## Benefits

1. **Single Codebase**: One scraper works for all Delhi District Courts
2. **Easy Expansion**: Add new courts by updating URL mapping only
3. **Flexible Input**: Accepts multiple court name formats
4. **Clear Errors**: Helpful error messages with available courts
5. **Maintainable**: Centralized URL configuration

## Testing

Test with different court names:

```bash
# Test Central Delhi
curl -X POST https://your-function-url/fetchEastDelhiDistrictJudgments \
  -H "Content-Type: application/json" \
  -d '{"courtName": "Central District Court, Delhi", "diaryNumber": "212", "year": "2022", "caseType": "CR Cases", "courtComplex": "Tis Hazari Court Complex"}'

# Test East Delhi
curl -X POST https://your-function-url/fetchEastDelhiDistrictJudgments \
  -H "Content-Type: application/json" \
  -d '{"courtName": "East District Court, Delhi", "diaryNumber": "212", "year": "2022", "caseType": "CR Cases", "courtComplex": "Karkardooma Court Complex"}'
```

## Notes

- The function name `fetchEastDelhiDistrictJudgments` is kept for backward compatibility but now works for all Delhi District Courts
- All Delhi District Court websites follow the same structure, so the same scraping logic works across all courts
- The `courtComplex` parameter should match the complexes available in the selected court's website
