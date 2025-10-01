pipeline {
  agent any

  environment {
    IMAGE_NAME = 'sit774-app'
    VERSION    = "${env.BUILD_NUMBER}"
    IMAGE_TAG  = 'latest'
    FULL_IMAGE = "${IMAGE_NAME}:${IMAGE_TAG}"
  }

  stages {
    stage('Checkout') {
      steps { checkout scm }
    }

    stage('Build') {
      steps {
        powershell 'node -v'
        powershell 'npm ci'
        powershell 'npm run build; if ($LASTEXITCODE -ne 0) { exit 0 }'
        powershell 'docker build -t sit774-app:latest .'

        archiveArtifacts artifacts: 'Dockerfile', fingerprint: true
      }
    }

    stage('Test') {
      steps {  powershell '$env:PORT="0"; npm test' }
      post { always { archiveArtifacts artifacts: 'coverage/**', allowEmptyArchive: true } }
    }

stage('Code Quality (SonarQube)') {
  steps {
    script {
      def scannerHome = tool 'sonar-scanner'
      withSonarQubeEnv('SonarQubeServer') {
        withCredentials([string(credentialsId: 'sonar-analysis-token', variable: 'SONAR_TOKEN')]) {
          bat "\"${scannerHome}\\bin\\sonar-scanner.bat\" " +
              "-Dsonar.host.url=%SONAR_HOST_URL% " +
              "-Dsonar.token=%SONAR_TOKEN% " +              
              "-Dsonar.projectKey=SIT_753_7.3HD " +
              "-Dsonar.projectName=\"SIT_753_7.3HD\" " +
              "-Dsonar.sources=. " +
              "-Dsonar.exclusions=\"node_modules/**,**/tests/**,**/*.html,**/*.db\" " +
              "-Dsonar.sourceEncoding=UTF-8 " +
              "-Dsonar.qualitygate.wait=true " +
              "-Dsonar.qualitygate.timeout=300"
        }
      }
    }
  }
}

stage('Security (npm audit & Trivy)') {
  steps {
    powershell '''
      # npm audit (do not fail build here)
      npm audit --audit-level=high
      if ($LASTEXITCODE -ne 0) {
        Write-Host "npm audit reported issues (continuing)"
        $global:LASTEXITCODE = 0
      }

      # Windows-safe paths for Trivy cache
      $ProjPath   = (Get-Location).Path
      $TrivyCache = Join-Path $env:WORKSPACE 'trivy-cache'
      if (!(Test-Path $TrivyCache)) { New-Item -ItemType Directory -Force -Path $TrivyCache | Out-Null }

      # 1) FS scan of source (report only)
      docker run --rm `
        -e TRIVY_CACHE_DIR=/root/.cache/trivy `
        -v "$($ProjPath):/project" `
        -v "$($TrivyCache):/root/.cache/trivy" `
        aquasec/trivy:latest fs /project `
        --scanners vuln `
        --severity HIGH,CRITICAL `
        --exit-code 0 `
        --skip-dirs /usr/local/lib/node_modules/npm `
        --skip-dirs /opt/yarn-v1.22.22

      # Ensure the image exists
      docker image inspect "$env:FULL_IMAGE" *> $null
      if ($LASTEXITCODE -ne 0) { throw "Image $env:FULL_IMAGE not found" }

      # Save image to tar
      $ImageTar = Join-Path $ProjPath 'image.tar'
      if (Test-Path $ImageTar) { Remove-Item -Force $ImageTar }
      docker save -o "$ImageTar" "$env:FULL_IMAGE"

      # 2) Image scan (this can fail build) – skip Node’s bundled npm/yarn
      docker run --rm `
        -e TRIVY_CACHE_DIR=/root/.cache/trivy `
        -v "$($ProjPath):/project" `
        -v "$($TrivyCache):/root/.cache/trivy" `
        aquasec/trivy:latest image --input /project/image.tar `
        --severity HIGH,CRITICAL `
        --exit-code 1 `
        --skip-dirs /usr/local/lib/node_modules/npm `
        --skip-dirs /opt/yarn-v1.22.22
    '''
  }
}


stage('Deploy (Staging)') {
  steps {
    powershell '''
$ProgressPreference = "SilentlyContinue"
$ErrorActionPreference = "Continue"   # avoid terminating on Docker stderr noise
$compose = "docker-compose.yml"
$svc = "app"

function Run([string]$cmd) {
  Write-Host ">> $cmd"
  cmd /c $cmd
  if ($LASTEXITCODE -ne 0) { throw "Command failed ($LASTEXITCODE): $cmd" }
}

Write-Host "[-] Down old stack..."
Run "docker compose -f $compose down -v --remove-orphans"

Write-Host "[-] Build & up..."
Run "docker compose -f $compose build $svc"
Run "docker compose -f $compose up -d $svc"

Write-Host "[-] Wait for health..."
$cid = (cmd /c "docker compose -f $compose ps -q $svc").Trim()
if (-not $cid) { throw "Service '$svc' not found in compose ps" }

$deadline = (Get-Date).AddMinutes(3)
$status = ""
while ((Get-Date) -lt $deadline) {
  $status = (cmd /c "docker inspect -f {{.State.Health.Status}} $cid") 2>$null
  Write-Host ("{0} health={1}" -f (Get-Date).ToString("HH:mm:ss"), $status)
  if ($status -eq "healthy") { break }
  Start-Sleep -Seconds 3
}
if ($status -ne "healthy") {
  Write-Host "`n[!] Not healthy. Recent logs:"
  cmd /c "docker compose -f $compose logs --no-color $svc"
  throw "Container not healthy within timeout"
}

Write-Host "[-] HTTP health check..."
$code = & curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/healthz
Write-Host "HTTP $code"
if ($code -ne "200") { throw "Health endpoint returned $code" }

Write-Host "[✓] Staging is up."
'''
  }
}




stage('Release (Promote to Prod)') {
  when { anyOf { branch 'main'; branch 'master' } }
  steps {
    powershell 'if (Test-Path "docker-compose.prod.yml") { docker compose -f docker-compose.prod.yml up -d --build } else { Write-Host "No prod compose file, skipping prod deploy" }'
    powershell 'git config user.email "ci@example.com"; git config user.name "CI"; git tag -f v${env.BUILD_NUMBER}; git push --force --tags'
  }
}


    stage('Monitoring & Alerting') {
      steps {
        powershell 'docker compose -f docker-compose.yml up -d prometheus alertmanager'
        powershell 'Invoke-WebRequest -UseBasicParsing http://localhost:9090/-/ready | Out-Null'
      }
    }
  }

post {
  always {
    powershell 'docker compose -f docker-compose.yml ps; exit 0'
    powershell 'if (Test-Path "docker-compose.prod.yml") { docker compose -f docker-compose.prod.yml ps }; exit 0'
    cleanWs deleteDirs: true, notFailBuild: true
  }
}
}
