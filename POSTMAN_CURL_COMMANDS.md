# Postman cURL Commands for highCourtCasesUpsert API

## API Endpoint
```
https://asia-south1-booming-order-465208-t8.cloudfunctions.net/highCourtCasesUpsert
```

## Request Format
- **Method**: POST
- **Content-Type**: application/json
- **Body**: JSON with `date` field (format: DD-MM-YYYY)

## cURL Commands

### 1. Call with specific date (DD-MM-YYYY format)
```bash
curl --location 'https://asia-south1-booming-order-465208-t8.cloudfunctions.net/highCourtCasesUpsert' \
--header 'Content-Type: application/json' \
--data '{
    "date": "17-12-2024"
}'
```

### 2. Call without date (uses today's date automatically)
```bash
curl --location 'https://asia-south1-booming-order-465208-t8.cloudfunctions.net/highCourtCasesUpsert' \
--header 'Content-Type: application/json' \
--data '{}'
```

### 3. Call with different date (example: 15-01-2024)
```bash
curl --location 'https://asia-south1-booming-order-465208-t8.cloudfunctions.net/highCourtCasesUpsert' \
--header 'Content-Type: application/json' \
--data '{
    "date": "15-01-2024"
}'
```

## How to Import in Postman

1. **Copy the cURL command** (any of the above)
2. **Open Postman**
3. **Click "Import"** (top left)
4. **Select "Raw text"** tab
5. **Paste the cURL command**
6. **Click "Continue"** then **"Import"**

## Postman Collection JSON (Alternative)

You can also create a Postman collection with this JSON:

```json
{
  "info": {
    "name": "High Court Cases Upsert",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Scrape by Date",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n    \"date\": \"17-12-2024\"\n}",
          "options": {
            "raw": {
              "language": "json"
            }
          }
        },
        "url": {
          "raw": "https://asia-south1-booming-order-465208-t8.cloudfunctions.net/highCourtCasesUpsert",
          "protocol": "https",
          "host": [
            "asia-south1-booming-order-465208-t8",
            "cloudfunctions",
            "net"
          ],
          "path": [
            "highCourtCasesUpsert"
          ]
        }
      }
    }
  ]
}
```

## Date Format
- **Format**: `DD-MM-YYYY`
- **Example**: `17-12-2024` (17th December 2024)
- **Note**: If date is not provided, it automatically uses today's date

