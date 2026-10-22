param(
    [string]$BucketName = "semacare-thumbs-tu-9822",
    [string]$FunctionArn = "arn:aws:lambda:eu-west-2:541739392223:function:semacare-ai",
    [string]$Region = "eu-west-2"
)

$ErrorActionPreference = "Stop"

$awsCommand = Get-Command aws -ErrorAction SilentlyContinue
if ($null -ne $awsCommand) {
    $aws = $awsCommand.Source
} else {
    $aws = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
    if (-not (Test-Path -LiteralPath $aws)) {
        throw "AWS CLI was not found. Install AWS CLI v2 or add aws.exe to PATH."
    }
}

$configuration = @{
    LambdaFunctionConfigurations = @(
        @{
            Id = "semacare-ai-image-processing"
            LambdaFunctionArn = $FunctionArn
            Events = @("s3:ObjectCreated:*")
            Filter = @{
                Key = @{
                    FilterRules = @(
                        @{ Name = "Suffix"; Value = ".jpg" }
                    )
                }
            }
        }
    )
} | ConvertTo-Json -Depth 8 -Compress

& $aws s3api put-bucket-notification-configuration `
    --bucket $BucketName `
    --region $Region `
    --notification-configuration $configuration

& $aws s3api get-bucket-notification-configuration `
    --bucket $BucketName `
    --region $Region
