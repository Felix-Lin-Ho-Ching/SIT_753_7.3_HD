pipeline {
  agent any

  environment {
    IMAGE_NAME = 'sit774-app'
    IMAGE_TAG  = 'latest'
    FULL_IMAGE = "${IMAGE_NAME}:${IMAGE_TAG}"
  }

  stages {
    stage('Checkout') {
      steps { checkout scm }
    }

    stage('Build') {
      steps {
        powershell "node -v"
        powershell "npm ci"
        powershell "npm run build"
        powershell "docker build -t ${env.IMAGE_NAME}:${env.BUILD_NUMBER} -t ${env.FULL_IMAGE} ."
        archiveArtifacts artifacts: 'Dockerfile', fingerprint: true
      }
    }

    stage('Test') {
      environment { NODE_ENV = 'test' }
      steps {
        powershell "npm ci"
        powershell "npx jest --runInBand --coverage --forceExit"
      }
      post { always { archiveArtifacts artifacts: 'coverage/**', allowEmptyArchive: true } }
    }

    stage('Code Quality (SonarQube)') {
      steps {
        script {
          def scannerHome = tool 'sonar-scanner'
          withSonarQubeEnv('SonarQubeServer') {
            withCredentials([string(credentialsId: 'sonar-analysis-token', variable: 'SONAR_TOKEN')]) {
              bat "\"${scannerHome}\\bin\\sonar-scanner.bat\" -Dsonar.host.url=%SONAR_HOST_URL% -Dsonar.token=%SONAR_TOKEN% -Dsonar.projectKey=SIT_753_7.3HD -Dsonar.projectName=\"SIT_753_7.3HD\" -Dsonar.sources=. -Dsonar.exclusions=\"node_modules/**,**/tests/**,**/*.html,**/*.db\" -Dsonar.sourceEncoding=UTF-8 -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info"
            }
          }
        }
      }
    }

    stage('Quality Gate') {
      steps {
        timeout(time: 15, unit: 'MINUTES') {
          script {
            def qg = waitForQualityGate()
            if (qg.status != 'OK') { error "Quality gate: ${qg.status}" }
          }
        }
      }
    }

    stage('Security (npm audit & Trivy)') {
      steps {
        powershell """
mkdir security-reports -Force | Out-Null
npm audit --audit-level=high --json | Out-File -Encoding UTF8 security-reports\\npm-audit.json
$j = Get-Content security-reports\\npm-audit.json -Raw | ConvertFrom-Json
if ($j.metadata.vulnerabilities.high -gt 0 -or $j.metadata.vulnerabilities.critical -gt 0) { exit 1 }
$ProjPath = (Get-Location).Path
$TrivyCache = Join-Path $env:WORKSPACE 'trivy-cache'
if (!(Test-Path $TrivyCache)) { New-Item -ItemType Directory -Force -Path $TrivyCache | Out-Null }
docker run --rm -e TRIVY_CACHE_DIR=/root/.cache/trivy -v "$ProjPath:/project" -v "$TrivyCache:/root/.cache/trivy" aquasec/trivy:latest fs /project --scanners vuln --severity HIGH,CRITICAL --exit-code 0 --skip-dirs /usr/local/lib/node_modules/npm --skip-dirs /opt/yarn-v1.22.22
docker image inspect "${env.FULL_IMAGE}" | Out-Null
$ImageTar = Join-Path $ProjPath 'image.tar'
if (Test-Path $ImageTar) { Remove-Item -Force $ImageTar }
docker save -o "$ImageTar" "${env.FULL_IMAGE}"
docker run --rm -e TRIVY_CACHE_DIR=/root/.cache/trivy -v "$ProjPath:/project" -v "$TrivyCache:/root/.cache/trivy" aquasec/trivy:latest image --input /project/image.tar --severity HIGH,CRITICAL --exit-code 1 --skip-dirs /usr/local/lib/node_modules/npm --skip-dirs /opt/yarn-v1.22.22
"""
      }
      post { always { archiveArtifacts artifacts: 'security-reports/**', allowEmptyArchive: false } }
    }

    stage('Deploy (Staging)') {
      steps {
        powershell "docker compose -f docker-compose.yml down -v --remove-orphans; if (\$LASTEXITCODE -ne 0) { \$global:LASTEXITCODE = 0 }"
        powershell "docker ps --filter \"publish=3000\" -q | % { docker rm -f \$_ } | Out-Null"
        powershell "docker compose -f docker-compose.yml up -d"
        powershell "Start-Sleep -Seconds 5"
        powershell "$r = iwr -UseBasicParsing http://localhost:3000/healthz -TimeoutSec 20; if ($r.StatusCode -ne 200) { exit 1 }"
      }
    }

    stage('Release (Promote to Prod)') {
      when { anyOf { branch 'main'; branch 'master' } }
      steps {
        powershell "$env:IMAGE_TAG='${env.BUILD_NUMBER}'"
        powershell "if (Test-Path 'docker-compose.prod.yml') { docker compose -f docker-compose.prod.yml up -d } else { Write-Host 'No prod compose file, skipping prod deploy' }"
      }
    }

    stage('Monitoring & Alerting') {
      steps {
        powershell "$m=(iwr -UseBasicParsing http://localhost:3000/metrics -TimeoutSec 20).Content; if ($m -notmatch 'http_requests_total') { exit 1 }"
      }
    }
  }

  post {
    always {
      powershell "docker compose -f docker-compose.yml ps"
      powershell "if (Test-Path 'docker-compose.prod.yml') { docker compose -f docker-compose.prod.yml ps }"
      cleanWs deleteDirs: true, notFailBuild: true
    }
  }
}
