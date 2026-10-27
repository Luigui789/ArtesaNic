param(
    [ValidateSet('Install', 'Dev', 'Db', 'Frontend', 'Backend', 'Migrate', 'Lint', 'Test', 'Health', 'Docs', 'Clean')]
    [string]$Task = 'Dev'
)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
function Run-Command {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program terminó con código $LASTEXITCODE" }
}
function In-Backend {
    param([string[]]$Arguments)
    Push-Location (Join-Path $projectRoot 'apps/backend')
    try { Run-Command uv $Arguments } finally { Pop-Location }
}
Push-Location $projectRoot
try {
    if (!(Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
    switch ($Task) {
        Install { Run-Command pnpm @('-C', 'apps/frontend', 'install', '--frozen-lockfile'); In-Backend @('sync', '--locked') }
        Dev { Run-Command docker @('compose', 'up', '--build') }
        Db { Run-Command docker @('compose', 'up', '-d', 'db') }
        Frontend { Run-Command pnpm @('-C', 'apps/frontend', 'dev', '--host', '127.0.0.1') }
        Backend { In-Backend @('run', 'python', 'manage.py', 'runserver') }
        Migrate { In-Backend @('run', 'python', 'manage.py', 'migrate') }
        Lint {
            Run-Command pnpm @('-C', 'apps/frontend', 'lint')
            In-Backend @('run', 'ruff', 'check', '.')
            In-Backend @('run', 'ruff', 'format', '--check', '.')
        }
        Test {
            Run-Command pnpm @('-C', 'apps/frontend', 'typecheck')
            Run-Command pnpm @('-C', 'apps/frontend', 'test')
            In-Backend @('run', 'python', 'manage.py', 'check')
            In-Backend @('run', 'python', 'manage.py', 'makemigrations', '--check', '--dry-run')
            In-Backend @('run', 'python', 'manage.py', 'test')
            Run-Command python @('infra/scripts/check-doc-links.py')
            Run-Command python @('infra/scripts/check_requirements_coverage.py')
        }
        Health { Run-Command docker @('compose', 'exec', '-T', 'frontend', 'node', '../../infra/scripts/check-health.mjs') }
        Docs {
            Run-Command python @('infra/scripts/check-doc-links.py')
            Run-Command python @('infra/scripts/check_requirements_coverage.py')
        }
        Clean { Run-Command docker @('compose', 'stop') }
    }
} finally { Pop-Location }
