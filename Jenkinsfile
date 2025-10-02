pipeline {
  agent any

  options {
    skipDefaultCheckout(true)
    disableConcurrentBuilds()
    timestamps()
    buildDiscarder(logRotator(numToKeepStr: '20'))
    ansiColor('xterm')
  }

  environment {
    SERVICE_PORT     = '3000'
    SERVICE_URL      = "http://localhost:${SERVICE_PORT}"
    IMAGE_NAME       = 'sit774-app'
    FULL_IMAGE       = "sit774-app:${env.BUILD_NUMBER}"
    PROD_IMAGE       = 'sit774-app:prod'
    TRIVY_CACHE_DIR  = "${WORKSPACE}/trivy-cache"
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Build') {
      steps {
        powershell '''
          node -v
          npm ci
          npm run build

          docker buildx build -t "${env:FULL_IMAGE}" -t "${env:IMAGE_NAME}:latest" .
        '''
      }
      post {
        always {
          archiveArtifacts artifacts: 'package-lock.json, Dockerfile', allowEmptyArchive: true
        }
      }
    }

    stage('Test') {
      environment {
        JEST_JUNIT_OUTPUT = 'junit/junit.xml'
      }
      steps {
        powershell '''
          if (!(Test-Path junit)) { New-Item -ItemType Directory -Force -Path junit | Out-Null }
          if (!(Test-Path coverage)) { New-Item -ItemType Directory -Force -Path coverage | Out-Null }

          # Ensure JUnit reporter is available (doesn't modify package.json)
          npm i --no-save jest-junit

          npm test
        '''
      }
      post {
        always {
          junit 'junit/*.xml'
          archiveArtifacts artifacts: 'coverage/**', allowEmptyArchive: true
        }
      }
    }

    stage('Code Quality (SonarQube)') {
      steps {
        script {
          def scannerHome = tool 'sonar-scanner' // your configured scanner name
          withSonarQubeEnv('SonarQubeServer') {    // your configured server name
            bat "\"${scannerHome}/bin/sonar-scanner.bat\" " +
                "-Dsonar.host.url=%SONAR_HOST_URL% " +
                "-Dsonar.token=%SONAR_AUTH_TOKEN% " +
                "-Dsonar.projectKey=SIT_753_7.3HD " +
                "-Dsonar.projectName=\"SIT_753_7.3HD\" " +
                "-Dsonar.sources=. " +
                "-Dsonar.tests=__tests__ " +
                "-Dsonar.test.inclusions=__tests__/**/*.test.js " +
                "-Dsonar.javascript.lcov.reportPaths=coverage/lcov.info " +
                "-Dsonar.sourceEncoding=UTF-8 " +
                "-Dsonar.projectVersion=${env.BUILD_NUMBER} " +
                "-Dsonar.qualitygate.wait=false"
          }
        }
      }
    }

    stage('Quality Gate') {
      steps {
        timeout(time: 15, unit: 'MINUTES') {
          waitForQualityGate()
        }
      }
    }

    stage('Security (npm audit & Trivy)') {
      steps {
        powershell '''
          $out = Join-Path $env:WORKSPACE 'security-reports'
          if (!(Test-Path $out)) { New-Item -ItemType Directory -Force -Path $out | Out-Null }
          if (!(Test-Path $env:TRIVY_CACHE_DIR)) { New-Item -ItemType Directory -Force -Path $env:TRIVY_CACHE_DIR | Out-Null }

          # npm audit (fail build if >= HIGH)
          npm audit --audit-level=high --json | Out-File -Encoding UTF8 (Join-Path $out 'npm-audit.json')
          if ($LASTEXITCODE -ne 0) { Write-Host 'npm audit found >=HIGH'; exit 1 }

          # Trivy filesystem scan (report only)
          docker run --rm `
            -e TRIVY_CACHE_DIR=/root/.cache/trivy `
            -v "$($env:WORKSPACE):/project" `
            -v "$($env:TRIVY_CACHE_DIR):/root/.cache/trivy" `
            aquasec/trivy:latest fs /project `
            --scanners vuln `
            --severity HIGH,CRITICAL `
            --exit-code 0 `
            --format json -o /project/security-reports/trivy-fs.json

          # Save image as tar, then scan tar (fail on HIGH/CRITICAL)
          $tar = Join-Path $out ("${env:IMAGE_NAME}-" + ${env:BUILD_NUMBER} + ".tar")
          docker save "${env:FULL_IMAGE}" -o $tar

          docker run --rm `
            -e TRIVY_CACHE_DIR=/root/.cache/trivy `
            -v "$($env:WORKSPACE):/project" `
            -v "$($env:TRIVY_CACHE_DIR):/root/.cache/trivy" `
            aquasec/trivy:latest image --input "/project/security-reports/$(Split-Path -Leaf $tar)" `
            --scanners vuln `
            --severity HIGH,CRITICAL `
            --exit-code 1 `
            --format json -o /project/security-reports/trivy-image.json
        '''
      }
      post {
        always {
          archiveArtifacts artifacts: 'security-reports/**', allowEmptyArchive: false
        }
      }
    }

    stage('Deploy (Staging)') {
      steps {
        powershell '''
          docker compose down -v 2>$null
          docker compose up -d
          docker ps
        '''
      }
    }

    stage('Release (Promote to Prod)') {
      steps {
        powershell '''
          docker buildx build -t "${env:PROD_IMAGE}" .
          docker compose up -d --force-recreate
        '''
      }
    }

    stage('Monitoring & Alerting') {
      steps {
        script {
          // Only fail if health is bad; metrics are optional
          powershell '''
            $base = "${env:SERVICE_URL}"

            # Wait for healthz up to 60s
            $ok = $false
            for ($i=0; $i -lt 30; $i++) {
              try {
                $r = iwr -UseBasicParsing "$base/healthz" -TimeoutSec 2
                if ($r.StatusCode -eq 200 -and ($r.Content -match 'ok')) { $ok = $true; break }
              } catch { Start-Sleep -Milliseconds 2000 }
            }
            if (-not $ok) {
              Write-Error "Health check FAILED at $base/healthz"
              exit 1
            }

            # Try metrics; warn if missing but do NOT fail
            try {
              $m = iwr -UseBasicParsing "$base/metrics" -TimeoutSec 3
              $path = Join-Path $env:WORKSPACE 'metrics.txt'
              $m.Content | Out-File -Encoding UTF8 $path
            } catch {
              Write-Host "Metrics endpoint not available (non-blocking)."
            }
          '''
        }
      }
      post {
        always {
          archiveArtifacts artifacts: 'metrics.txt', allowEmptyArchive: true
        }
      }
    }
  }

  post {
    always {
      powershell 'docker ps'
      cleanWs()
    }
  }
}
