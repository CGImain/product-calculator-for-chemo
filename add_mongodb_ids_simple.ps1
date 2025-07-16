# Read the JSON file
$jsonPath = 'static\data\c.json'
$jsonContent = Get-Content $jsonPath -Raw | ConvertFrom-Json

# Function to generate MongoDB-like ObjectId (24 character hex string)
function New-MongoObjectId {
    $bytes = [byte[]]::new(12)
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

# Add _id field to each document if it doesn't exist
foreach ($item in $jsonContent) {
    if (-not $item._id) {
        $objectId = New-MongoObjectId
        $item | Add-Member -MemberType NoteProperty -Name '_id' -Value @{
            '$oid' = $objectId
        } -Force
    }
}

# Save the updated content with proper MongoDB _id format
$jsonContent | ConvertTo-Json -Depth 10 | Set-Content $jsonPath -Encoding UTF8

Write-Output "MongoDB _id fields have been added to the JSON file."
