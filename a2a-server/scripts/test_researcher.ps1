param(
    [string]$BaseUrl = "http://localhost:8013",
    [int]$Retries = 5,
    [int]$DelaySeconds = 2
)

function Invoke-WithRetry {
    param([ScriptBlock]$Action)
    for ($i = 0; $i -lt $Retries; $i++) {
        try {
            return & $Action
        } catch {
            if ($i -eq ($Retries - 1)) { throw }
            Start-Sleep -Seconds $DelaySeconds
        }
    }
}

Write-Host "Checking health..."
Invoke-WithRetry { Invoke-RestMethod -Uri "$BaseUrl/health" -Method Get }

Write-Host "Running KEYWORDS..."
Invoke-WithRetry {
    Invoke-RestMethod -Uri "$BaseUrl/a2a/act" -Method Post -ContentType "application/json" -InFile "examples/keywords.json"
}

Write-Host "Running EVIDENCE..."
Invoke-WithRetry {
    Invoke-RestMethod -Uri "$BaseUrl/a2a/act" -Method Post -ContentType "application/json" -InFile "examples/evidence.json"
}

Write-Host "Running STATS..."
Invoke-WithRetry {
    Invoke-RestMethod -Uri "$BaseUrl/a2a/act" -Method Post -ContentType "application/json" -InFile "examples/stats.json"
}

Write-Host "Running CONFIG_CHECK..."
Invoke-WithRetry {
    Invoke-RestMethod -Uri "$BaseUrl/a2a/act" -Method Post -ContentType "application/json" -InFile "examples/config_check.json"
}
