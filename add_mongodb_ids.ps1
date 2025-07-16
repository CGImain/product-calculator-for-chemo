# Load MongoDB.Bson for ObjectId generation
Add-Type -Path "C:\Program Files\MongoDB\Driver\MongoDB.Bson.dll"

# Read the JSON file
$jsonPath = 'static\data\c.json'
$jsonContent = Get-Content $jsonPath -Raw | ConvertFrom-Json

# Add _id field to each document if it doesn't exist
foreach ($item in $jsonContent) {
    if (-not $item._id) {
        $objectId = [MongoDB.Bson.ObjectId]::GenerateNewId()
        $item | Add-Member -MemberType NoteProperty -Name '_id' -Value @{
            '$oid' = $objectId.ToString()
        }
    }
}

# Save the updated content with proper MongoDB _id format
$jsonContent | ConvertTo-Json -Depth 10 | Set-Content $jsonPath -Encoding UTF8

Write-Output "MongoDB _id fields have been added to the JSON file."
