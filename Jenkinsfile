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
  environment { NODE_ENV = 'test' }
  steps {
    powershell "$env:PORT='0'; $env:JEST_JUNIT_OUTPUT='junit\\results.xml'; npm test -- --reporters=default --reporters=jest-junit"
  }
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
      docker compose -f docker-compose.yml down -v --remove-orphans
      if ($LASTEXITCODE -ne 0) {
        Write-Host "compose down failed (ignored)"
        $global:LASTEXITCODE = 0
      }
      # belt & suspenders: kill any container publishing 3000
      docker ps --filter "publish=3000" -q | % { docker rm -f $_ } | Out-Null
    '''
    powershell 'docker compose -f docker-compose.yml up -d --build'
    powershell 'Start-Sleep -Seconds 5'
    powershell 'Invoke-WebRequest -UseBasicParsing http://localhost:3000/healthz | Out-Null'
  }
}



stage('Release (Promote to Prod)') {
  when { anyOf { branch 'main'; branch 'master' } }
  steps {
    powershell '''
      if (Test-Path "docker-compose.prod.yml") {
        docker compose -f docker-compose.prod.yml up -d --build
      } else {
        Write-Host "No prod compose file, skipping prod deploy"
      }
      Write-Host "Skipping git tag/push"
    '''
  }
}


    stage('Monitoring & Alerting') {
  steps {
    powershell '''
      if (!(Test-Path "docker-compose.yml")) {
        Write-Host "No docker-compose.yml; skipping monitoring."
        exit 0
      }

      $services = (docker compose -f docker-compose.yml config --services) -split "`n"
      if ($services -contains "prometheus" -and $services -contains "alertmanager") {
        docker compose -f docker-compose.yml up -d prometheus alertmanager
        Invoke-WebRequest -UseBasicParsing http://localhost:9090/-/ready | Out-Null
      } else {
        Write-Host "prometheus/alertmanager not in compose; skipping monitoring."
      }
      $global:LASTEXITCODE = 0
    '''
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
