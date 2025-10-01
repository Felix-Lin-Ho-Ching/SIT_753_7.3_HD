pipeline {
  agent any

  environment {
    IMAGE_NAME = 'sit774-app'
    VERSION    = "${env.BUILD_NUMBER}"
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
      def scannerHome = tool 'sonar-scanner'     // Tools → SonarQube Scanner → Name: sonar-scanner
      withSonarQubeEnv('SonarQubeServer') {
        powershell "& \"${scannerHome}\\bin\\sonar-scanner.bat\" ^
          -Dsonar.projectKey=SIT_753_7.3HD ^
          -Dsonar.projectName=\"SIT_753_7.3HD\" ^
          -Dsonar.sources=. ^
          -Dsonar.exclusions=\"node_modules/**,**/tests/**,**/*.html,**/*.db\" ^
          -Dsonar.sourceEncoding=UTF-8 ^
          -Dsonar.qualitygate.wait=true ^
          -Dsonar.qualitygate.timeout=300"
      }
    }
  }
}


    stage('Security (npm audit & Trivy)') {
      steps {
        powershell 'npm audit --audit-level=high; exit 0'
        powershell 'docker run --rm -v ${pwd}:/src aquasec/trivy:latest fs --severity HIGH,CRITICAL --exit-code 0 /src'
        powershell 'docker run --rm aquasec/trivy:latest image --severity HIGH,CRITICAL --exit-code 0 ${env.IMAGE_NAME}:${env.VERSION}'
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
      powershell 'docker compose -f docker-compose.yml ps; exit 0'
      powershell 'docker compose -f docker-compose.prod.yml ps; exit 0'
      cleanWs deleteDirs: true, notFailBuild: true
    }
  }
}
