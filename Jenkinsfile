pipeline {
  agent any

  environment {
    IMAGE_NAME = 'sit774-app'
    IMAGE_TAG  = "${env.BUILD_NUMBER}"
    FULL_IMAGE = "${IMAGE_NAME}:${IMAGE_TAG}"
    LATEST_TAG = "${IMAGE_NAME}:latest"
    SONAR_PROJECT_KEY = 'SIT_753_7.3HD'
  }

  tools {
    nodejs 'NodeJS'
    jdk 'JDK17'
    maven 'Maven'   // only for some Sonar setups that expect a JRE/JDK tool
  }

  stages {

    stage('Checkout') {
      steps { checkout scm }
    }

    stage('Build') {
      steps {
        powershell 'node -v'
        powershell 'npm ci'
        powershell 'npm run build'
        powershell "docker build -t ${env.FULL_IMAGE} -t ${env.LATEST_TAG} ."
        archiveArtifacts artifacts: 'Dockerfile', fingerprint: true
      }
    }

    stage('Test') {
      environment { NODE_ENV = 'test' }
      steps {
        powershell 'npm ci'
        // HARD FAIL on non-zero exit (default behavior)
        powershell 'npx jest --runInBand --coverage --forceExit'
      }
      post {
        always {
          archiveArtifacts artifacts: 'coverage/**', allowEmptyArchive: true
          junit allowEmptyResults: true, testResults: 'junit/*.xml'
        }
      }
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
                  "-Dsonar.projectKey=${SONAR_PROJECT_KEY} " +
                  "-Dsonar.projectName=\"${SONAR_PROJECT_KEY}\" " +
                  "-Dsonar.sources=. " +
                  "-Dsonar.tests=__tests__ " +
                  "-Dsonar.test.inclusions=__tests__/**/*.test.js " +
                  "-Dsonar.javascript.lcov.reportPaths=coverage/lcov.info " +
                  "-Dsonar.sourceEncoding=UTF-8 " +
                  // baseline new code to previous version so gate focuses on changes
                  "-Dsonar.projectVersion=${env.BUILD_NUMBER} " +
                  "-Dsonar.qualitygate.wait=false"
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
        powershell '''
          $outDir = Join-Path $env:WORKSPACE 'security-reports'
          if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }

          # npm audit (HARD FAIL on >= high). Save JSON.
          npm audit --audit-level=high --json | Out-File -Encoding UTF8 (Join-Path $outDir 'npm-audit.json')
          if ($LASTEXITCODE -ne 0) { Write-Host 'npm audit found >=HIGH'; exit 1 }

          # Prepare paths for Trivy (Windows-friendly)
          $proj = (Get-Location).Path
          $cache = Join-Path $env:WORKSPACE 'trivy-cache'
          if (!(Test-Path $cache)) { New-Item -ItemType Directory -Force -Path $cache | Out-Null }

          # 1) FS scan (report only) + JSON/SARIF artifacts
          docker run --rm `
            -e TRIVY_CACHE_DIR=/root/.cache/trivy `
            -v "$($proj):/project" `
            -v "$($cache):/root/.cache/trivy" `
            aquasec/trivy:latest fs /project `
            --scanners vuln `
            --severity HIGH,CRITICAL `
            --exit-code 0 `
            --format json -o /project/security-reports/trivy-fs.json

          docker run --rm `
            -e TRIVY_CACHE_DIR=/root/.cache/trivy `
            -v "$($proj):/project" `
            -v "$($cache):/root/.cache/trivy" `
            aquasec/trivy:latest fs /project `
            --scanners vuln `
            --severity HIGH,CRITICAL `
            --exit-code 0 `
            --format sarif -o /project/security-reports/trivy-fs.sarif

          # Ensure the image exists
          docker image inspect "${env:FULL_IMAGE}" *> $null
          if ($LASTEXITCODE -ne 0) { throw "Image ${env:FULL_IMAGE} not found" }

          # 2) Image scan (HARD FAIL on findings) + JSON/SARIF artifacts
          docker run --rm `
            -e TRIVY_CACHE_DIR=/root/.cache/trivy `
            -v "$($proj):/project" `
            -v "$($cache):/root/.cache/trivy" `
            aquasec/trivy:latest image "${env:FULL_IMAGE}" `
            --scanners vuln `
            --severity HIGH,CRITICAL `
            --exit-code 1 `
            --format json -o /project/security-reports/trivy-image.json

          docker run --rm `
            -e TRIVY_CACHE_DIR=/root/.cache/trivy `
            -v "$($proj):/project" `
            -v "$($cache):/root/.cache/trivy" `
            aquasec/trivy:latest image "${env:FULL_IMAGE}" `
            --scanners vuln `
            --severity HIGH,CRITICAL `
            --exit-code 0 `
            --format sarif -o /project/security-reports/trivy-image.sarif
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
          docker compose -f docker-compose.yml down -v --remove-orphans
          if ($LASTEXITCODE -ne 0) { $global:LASTEXITCODE = 0 }
          # free port 3000 if anything else is bound
          docker ps --filter "publish=3000" -q | % { docker rm -f $_ } | Out-Null

          # pass the freshly built tag into compose (if your compose uses IMAGE_TAG)
          $env:IMAGE_TAG = "${env:BUILD_NUMBER}"
          docker compose -f docker-compose.yml up -d --build
        '''
        // Health probe: HARD FAIL if not HTTP 200
        powershell '$r = iwr -UseBasicParsing http://localhost:3000/healthz -TimeoutSec 20; if ($r.StatusCode -ne 200) { exit 1 }'
      }
    }

    stage('Release (Promote to Prod)') {
      when { anyOf { branch 'main'; branch 'master' } }
      steps {
        powershell '''
          if (Test-Path "docker-compose.prod.yml") {
            $env:IMAGE_TAG = "${env:BUILD_NUMBER}"
            docker compose -f docker-compose.prod.yml up -d --build
          } else {
            Write-Host "No docker-compose.prod.yml; skipping prod deploy"
          }
        '''
      }
    }

    stage('Monitoring & Alerting') {
      steps {
        script {
          try {
            powershell '$m=(iwr -UseBasicParsing http://localhost:3000/metrics -TimeoutSec 20).Content; if ($m -notmatch "http_requests_total" -or $m -notmatch "http_request_duration_seconds_bucket") { exit 1 }'
          } catch (e) {
            powershell '''
              $u = $env:WEBHOOK_URL
              if ($u) {
                $p = @{ text = "Monitoring failed: /metrics missing or invalid for sit774-app" } | ConvertTo-Json
                iwr -Method Post -Body $p -ContentType "application/json" $u
              }
              exit 1
            '''
          }
        }
      }
    }

  } // stages

  post {
    always {
      powershell 'docker compose -f docker-compose.yml ps; $global:LASTEXITCODE=0'
      powershell 'if (Test-Path "docker-compose.prod.yml") { docker compose -f docker-compose.prod.yml ps }; $global:LASTEXITCODE=0'
      cleanWs deleteDirs: true, notFailBuild: true
    }
  }
}
