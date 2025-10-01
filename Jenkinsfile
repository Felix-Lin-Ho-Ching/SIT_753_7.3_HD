pipeline {
  agent any
  options { skipDefaultCheckout(true); timestamps() }

  stages {
    stage('Checkout') { steps { checkout scm } }

    stage('Build') {
      steps {
        powershell '''
          node -v
          npm ci
          npm run build
          docker build -t sit774-app:latest .
        '''
        archiveArtifacts artifacts: 'Dockerfile,package*.json', fingerprint: true, onlyIfSuccessful: true
      }
    }

    stage('Test') {
      steps {
        powershell 'cross-env NODE_ENV=test jest --runInBand --coverage'
        archiveArtifacts artifacts: 'coverage/**', fingerprint: true, onlyIfSuccessful: true
      }
    }

    stage('Code Quality (SonarQube)') {
      steps {
        withSonarQubeEnv('SonarQubeServer') {
          bat """
            "C:\\ProgramData\\Jenkins\\.jenkins\\tools\\hudson.plugins.sonar.SonarRunnerInstallation\\sonar-scanner\\bin\\sonar-scanner.bat" ^
              -Dsonar.host.url=%SONAR_HOST_URL% ^
              -Dsonar.token=%SONAR_AUTH_TOKEN% ^
              -Dsonar.projectKey=SIT_753_7.3HD ^
              -Dsonar.projectName="SIT_753_7.3HD" ^
              -Dsonar.sources=. ^
              -Dsonar.exclusions="node_modules/**,**/tests/**,**/*.html,**/*.db,__tests__/**/*.test.js" ^
              -Dsonar.tests="__tests__" ^
              -Dsonar.test.inclusions="__tests__/**/*.test.js" ^
              -Dsonar.javascript.lcov.reportPaths=coverage\\lcov.info ^
              -Dsonar.sourceEncoding=UTF-8 ^
              -Dsonar.qualitygate.wait=true ^
              -Dsonar.qualitygate.timeout=300
          """
        }
      }
    }

    stage('Security (npm audit & Trivy)') {
      steps {
        powershell '''
          npm audit --audit-level=high
          if ($LASTEXITCODE -ne 0) { Write-Host "npm audit reported issues (continuing)"; $global:LASTEXITCODE = 0 }

          $ProjPath   = (Get-Location).Path
          $TrivyCache = Join-Path $ProjPath ".trivy-cache"
          if (!(Test-Path $TrivyCache)) { New-Item -ItemType Directory -Force -Path $TrivyCache | Out-Null }

          docker save sit774-app:latest -o "$ProjPath\\image.tar"

          docker run --rm `
            -e TRIVY_CACHE_DIR=/root/.cache/trivy `
            -v "${ProjPath}:/project" `
            -v "${TrivyCache}:/root/.cache/trivy" `
            aquasec/trivy:latest image --input /project/image.tar `
            --severity HIGH,CRITICAL `
            --ignore-unfixed `
            --exit-code 1 `
            --skip-dirs /usr/local/lib/node_modules/npm `
            --skip-dirs /opt/yarn-v1.22.22
        '''
      }
    }

    stage('Deploy (Staging)') {
      when { expression { fileExists('docker-compose.staging.yml') } }
      steps { powershell 'docker compose -f docker-compose.staging.yml up -d --build' }
    }

    stage('Release (Promote to Prod)') {
      when { expression { fileExists('docker-compose.prod.yml') } }
      steps {
        input message: 'Promote to production?', ok: 'Deploy'
        powershell 'docker compose -f docker-compose.prod.yml up -d --build'
      }
    }

    stage('Teardown') {        
      when { always() }
      steps {
        powershell '''
          docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
          if (Test-Path ".\\docker-compose.staging.yml") { docker compose -f docker-compose.staging.yml down }
          if (Test-Path ".\\docker-compose.prod.yml")    { docker compose -f docker-compose.prod.yml down }
        '''
      }
    }
  }

  post {
    always {
      node { cleanWs() }       
    }
  }
}
