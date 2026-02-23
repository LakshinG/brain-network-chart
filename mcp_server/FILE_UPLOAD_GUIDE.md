# File Upload Guide

The MCP server now supports user-uploaded files for analysis. This guide shows how to use the file upload functionality.

## Overview

- **Upload Directory**: `uploaded_files/` (created automatically)
- **Supported Formats**: CSV, TSV, Excel, MATLAB v7.3 (.mat)
- **File Management**: Upload, list, delete operations
- **Integration**: Seamless integration with all analysis tools

## File Upload Endpoints

### 1. Upload a File

Upload a file to the server for later use in analyses.

**Endpoint**: `POST /upload`

**Headers**:
```
Authorization: Bearer <api-key>
Content-Type: multipart/form-data
```

**Request** (curl example):
```bash
curl -X POST http://yukon.acm.unc.edu:8010/upload \
  -H "Authorization: Bearer your-api-key" \
  -F "file=@your_data.csv"
```

**Response**:
```json
{
  "status": "success",
  "timestamp": "2026-02-03T16:30:45.123456",
  "file_info": {
    "original_filename": "your_data.csv",
    "saved_filename": "your_data.csv",
    "file_size_bytes": 45623,
    "upload_timestamp": "2026-02-03T16:30:45.123456"
  }
}
```

### 2. List Uploaded Files

List all files currently on the server.

**Endpoint**: `GET /list_files`

**Headers**:
```
Authorization: Bearer <api-key>
```

**Request** (curl example):
```bash
curl -X GET http://yukon.acm.unc.edu:8010/list_files \
  -H "Authorization: Bearer your-api-key"
```

**Response**:
```json
{
  "status": "success",
  "timestamp": "2026-02-03T16:30:50.654321",
  "count": 2,
  "files": [
    {
      "filename": "your_data.csv",
      "size_bytes": 45623,
      "modified_time": "2026-02-03T16:30:45.123456"
    },
    {
      "filename": "overlay_data.csv",
      "size_bytes": 12345,
      "modified_time": "2026-02-03T16:25:30.987654"
    }
  ]
}
```

### 3. Delete an Uploaded File

Remove a file from the server.

**Endpoint**: `DELETE /delete_file` or `POST /delete_file`

**Headers**:
```
Authorization: Bearer <api-key>
Content-Type: application/json
```

**Request Body**:
```json
{
  "filename": "your_data.csv"
}
```

**Request** (curl example):
```bash
curl -X DELETE http://yukon.acm.unc.edu:8010/delete_file \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"filename": "your_data.csv"}'
```

**Response**:
```json
{
  "status": "success",
  "timestamp": "2026-02-03T16:31:00.111111",
  "result": {
    "status": "success",
    "deleted_file": "your_data.csv"
  }
}
```

## Using Uploaded Files in Analyses

Once a file is uploaded, use its filename in any analysis endpoint. The server automatically checks the `uploaded_files/` directory.

### CFC Wavelet Analysis with Uploaded Data

```bash
curl -X POST http://yukon.acm.unc.edu:8010/run_cfc_wavelet_analysis \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "data_path": "your_data.csv",
    "window_size": 100,
    "step_size": 90,
    "padding": true
  }'
```

### Hub Detection with Uploaded Data

```bash
curl -X POST http://yukon.acm.unc.edu:8010/run_hub_detection \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "data_path": "your_data.csv",
    "window_size": 100,
    "step_size": 90,
    "k": 2,
    "hub_num": 10
  }'
```

### Normative Analysis with Uploaded Data

```bash
curl -X POST http://yukon.acm.unc.edu:8010/run_normative_analysis \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "x_phenotype": "Global mean of FC",
    "y_path": "overlay_data.csv",
    "age_col": "age",
    "val_col": "metric_value"
  }'
```

## File Path Resolution

The server uses the following logic to resolve file paths:

1. **Uploaded files first**: Checks `uploaded_files/` directory for the filename
2. **Then local files**: Checks current directory and relative paths
3. **Absolute paths**: Uses absolute paths if provided

This means you can use just the filename after uploading:
- ✅ `"data_path": "my_data.csv"` (uses uploaded file)
- ✅ `"data_path": "./my_data.csv"` (uses local file)
- ✅ `"data_path": "/absolute/path/my_data.csv"` (uses absolute path)

## Data Format Requirements

### BOLD Time Series (CSV)

For CFC wavelet and hub detection analyses:

```csv
Region_1,Region_2,Region_3,...,Region_N
0.234,0.156,0.892,...,-0.123
-0.456,0.789,0.234,...,0.567
...
```

**Requirements**:
- Rows = time points (BOLD volumes)
- Columns = brain regions/nodes
- Numeric values only
- Unnamed columns are automatically removed

### Overlay Data (CSV)

For normative analysis:

```csv
age,metric_value
24,45.2
26,48.5
28,51.3
...
```

**Requirements**:
- Must have age column (months, will be divided by 12)
- Must have metric value column
- Column names must match your age_col and val_col parameters

## Python Client Example

```python
import requests

API_KEY = "your-api-key"
BASE_URL = "http://yukon.acm.unc.edu:8010"
headers = {"Authorization": f"Bearer {API_KEY}"}

# Upload a file
with open("my_data.csv", "rb") as f:
    files = {"file": f}
    response = requests.post(f"{BASE_URL}/upload", headers=headers, files=files)
    print(response.json())

# List files
response = requests.get(f"{BASE_URL}/list_files", headers=headers)
files = response.json()["files"]
print(f"Found {len(files)} files")

# Run analysis with uploaded file
analysis_params = {
    "data_path": "my_data.csv",
    "window_size": 100,
    "step_size": 90
}
response = requests.post(
    f"{BASE_URL}/run_cfc_wavelet_analysis",
    json=analysis_params,
    headers=headers
)
result = response.json()

# Delete file when done
delete_params = {"filename": "my_data.csv"}
response = requests.delete(
    f"{BASE_URL}/delete_file",
    json=delete_params,
    headers=headers
)
```

## Multipart File Upload with Python

```python
import requests

API_KEY = "your-api-key"
BASE_URL = "http://yukon.acm.unc.edu:8010"

# Upload file using multipart form data
with open("my_data.csv", "rb") as f:
    files = {"file": ("my_data.csv", f, "text/csv")}
    headers = {"Authorization": f"Bearer {API_KEY}"}
    response = requests.post(f"{BASE_URL}/upload", headers=headers, files=files)
    
    if response.status_code == 200:
        file_info = response.json()["file_info"]
        print(f"Uploaded as: {file_info['saved_filename']}")
    else:
        print(f"Upload failed: {response.text}")
```

## Error Handling

### Common Errors

**401 Unauthorized**:
```json
{
  "error": "Unauthorized: Invalid API key"
}
```
→ Check MCP_API_KEY environment variable

**429 Rate Limited**:
```json
{
  "error": "Rate limit exceeded: 10 requests per 60s"
}
```
→ Wait before making more requests

**400 Bad Request**:
```json
{
  "error": "No file provided in request"
}
```
→ Ensure file is in the correct format for endpoint

**404 File Not Found**:
```json
{
  "error": "Cannot find data file 'nonexistent.csv'. Available uploaded files: ['file1.csv', 'file2.csv']"
}
```
→ Upload the file first or check the filename

## File Management Best Practices

1. **Upload once, use many**: Upload files once and reuse them for multiple analyses
2. **Clean up**: Delete files when done to save server space
3. **Descriptive names**: Use clear filenames like `patient_001_bold.csv`
4. **Backup**: Keep copies of important data locally
5. **Versioning**: If updating files, use version in filename: `data_v1.csv`, `data_v2.csv`

## Storage Limits

- **Default directory**: `uploaded_files/`
- **Max file size**: Depends on server configuration (default: no limit set)
- **Persistence**: Files remain on server until deleted manually

## Integration with Agent Client

The agent client (`agent_client.py`) automatically handles file uploads:

```python
from agent_client import BrainNetworkAgent

agent = BrainNetworkAgent()

# Agent can analyze uploaded files
response = agent.execute("Analyze the CFC patterns in my_data.csv")
```

Files should be uploaded first before running agent analyses.
