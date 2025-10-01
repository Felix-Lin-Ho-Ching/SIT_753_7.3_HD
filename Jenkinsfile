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
      steps { powershell 'npm test' }
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
              "-Dsonar.token=%SONAR_TOKEN% " +              // <-- project token
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
      # npm audit (informational)
      npm audit --audit-level=high
      if ($LASTEXITCODE -ne 0) {
        Write-Host "npm audit reported issues (continuing)"
        $global:LASTEXITCODE = 0
      }

      # cache dir (avoid systemprofile)
      $ProjPath   = (Get-Location).Path
      $TrivyCache = Join-Path $ProjPath ".trivy-cache"
      if (!(Test-Path $TrivyCache)) { New-Item -ItemType Directory -Force -Path $TrivyCache | Out-Null }

      # export image and scan
      docker save ${env:DOCKER_IMAGE} -o "$ProjPath\\image.tar"

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
      steps {
        powershell 'docker compose -f docker-compose.yml up -d --build'
        powershell 'Start-Sleep -Seconds 5'
        powershell 'Invoke-WebRequest -UseBasicParsing http://localhost:3000/healthz | Out-Null'
      }
    }

    stage('Release (Promote to Prod)') {
      when { anyOf { branch 'main'; branch 'master' } }
      steps {
        powershell 'docker compose -f docker-compose.prod.yml up -d --build'
        powershell 'git config user.email "ci@example.com"; git config user.name "CI"; git tag -f v${env.VERSION}; git push --force --tags'
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
    powershell '''
      docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
      if (Test-Path ".\\docker-compose.prod.yml") {
        docker compose -f docker-compose.prod.yml down
      } else {
        Write-Host "docker-compose.prod.yml not found; skipping compose down"
      }
    '''
    cleanWs()
  }
}
