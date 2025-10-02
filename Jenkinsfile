pipeline {
  agent any

  environment {
    IMAGE_NAME = 'sit774-app'
    IMAGE_TAG  = 'latest'
    FULL_IMAGE = "${IMAGE_NAME}:${IMAGE_TAG}"
    SONAR_PROJECT_KEY = 'SIT_753_7.3HD'
  }

  tools {
    nodejs 'NodeJS'
    jdk 'JDK17'
    maven 'Maven' 
    // Maven is only to satisfy Sonar plugin runtime on some Jenkins setups
    // Do not use Maven steps in this pipeline
    // If your controller already has a JRE, you can remove this tools block
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
        powershell 'docker build -t ${env.FULL_IMAGE} .'
        archiveArtifacts artifacts: 'Dockerfile', fingerprint: true
      }
    }

    stage('Test') {
      steps {
        powershell '$env:PORT="0"; npm test'
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
        withSonarQubeEnv('SonarQubeServer') {
          withEnv(["PATH+SCANNER=${tool 'sonar-scanner'}/bin"]) {
            powershell 'sonar-scanner -Dsonar.projectKey=${env.SONAR_PROJECT_KEY} -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info -Dsonar.sources=. -Dsonar.exclusions=coverage/**,node_modules/**,**/__tests__/** -Dsonar.tests=__tests__ -Dsonar.test.inclusions=**/__tests__/**'
          }
        }
      }
    }

    stage('Quality Gate') {
      steps {
        timeout(time: 15, unit: 'MINUTES') {
          script {
            def qg = waitForQualityGate()
            if (qg.status != 'OK') { error "Quality gate failure: ${qg.status}" }
          }
        }
      }
    }

    stage('Security Scan') {
      steps {
        powershell 'mkdir security-reports -Force | Out-Null'
        powershell 'npm audit --audit-level=high --json | Out-File -Encoding UTF8 security-reports\\npm-audit.json'
        powershell 'if ($LASTEXITCODE -ne 0) { Write-Host "npm audit found high vulnerabilities"; exit 1 }'
        powershell 'docker run --rm -v "${PWD}:/work" aquasec/trivy:latest image --scanners vuln --severity HIGH,CRITICAL --exit-code 1 --format json -o /work/security-reports/trivy.json ${env.FULL_IMAGE}'
      }
      post {
        always {
          archiveArtifacts artifacts: 'security-reports/**', allowEmptyArchive: false
        }
      }
    }

    stage('Deploy (Staging)') {
      steps {
        powershell 'docker compose -f docker-compose.yml up -d --remove-orphans'
      }
    }

    stage('Health Check (Staging)') {
      steps {
        powershell '$r = iwr -UseBasicParsing http://localhost:3000/healthz -TimeoutSec 15; if ($r.StatusCode -ne 200) { exit 1 }'
      }
    }

    stage('Release (Production)') {
      steps {
        powershell 'docker compose -f docker-compose.prod.yml up -d --remove-orphans'
      }
    }

    stage('Monitoring & Alerting') {
      steps {
        script {
          try {
            powershell '$m = (iwr -UseBasicParsing http://localhost:3000/metrics -TimeoutSec 15).Content; if ($m -notmatch "http_requests_total") { exit 1 }'
          } catch (e) {
            powershell '''
$u = $env:WEBHOOK_URL
if ($u) {
  $p = @{ text = "Monitoring failed on /metrics for sit774-app" } | ConvertTo-Json
  iwr -Method Post -Body $p -ContentType "application/json" $u
}
exit 1
'''
          }
        }
      }
    }
  }

  post {
    always {
      cleanWs(deleteDirs: true, disableDeferredWipeout: true)
    }
  }
}
