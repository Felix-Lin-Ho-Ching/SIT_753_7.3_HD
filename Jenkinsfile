pipeline {
  agent any
  environment {
    NODE_ENV = "ci"
    IMAGE_TAG = "${env.GIT_COMMIT.take(7)}"
    SONAR_HOST_URL = credentials('sonar-host-url')
    SONAR_TOKEN    = credentials('sonar-token')
  }
  tools { nodejs "NodeJS20" }
  stages {
    stage('Checkout') { steps { checkout scm } }
    stage('Build') {
      steps { sh 'node -v && npm ci' }
      post { success { archiveArtifacts artifacts: 'package-lock.json', fingerprint: true } }
    }
    stage('Test') {
      steps { sh 'npm test' }
      post {
        always {
          junit allowEmptyResults: true, testResults: 'junit*.xml'
          archiveArtifacts artifacts: 'coverage/**', allowEmptyArchive: true
        }
      }
    }
    stage('Code Quality') {
      when {
        anyOf {
          expression { return fileExists('sonar-project.properties') }
          expression { return fileExists('.eslintrc.js') || fileExists('.eslintrc.json') }
        }
      }
      steps {
        script {
          if (fileExists('sonar-project.properties')) {
            sh '''
              npx jest --coverage --coverageReporters=lcov --coverageReporters=text-summary
              npx sonar-scanner -Dsonar.host.url=$SONAR_HOST_URL -Dsonar.login=$SONAR_TOKEN
            '''
          } else {
            sh 'npm run lint || true'
          }
        }
      }
    }
    stage('Security') {
      steps { sh 'npm audit --production --audit-level=high || (echo "Security issues detected" && exit 1)' }
    }
    stage('Build Image') {
      steps {
        sh 'docker build -t sit774-10-4hd:${IMAGE_TAG} .'
        sh 'docker tag sit774-10-4hd:${IMAGE_TAG} sit774-10-4hd:latest'
      }
    }
    stage('Deploy to Staging') {
      steps {
        sh 'docker compose down || true'
        sh 'docker compose up -d --build'
      }
    }
    stage('Release') {
      when { branch 'main' }
      steps {
        sh '''
          git config user.email "ci@example.com"
          git config user.name "ci-bot"
          git tag -a "v${BUILD_NUMBER}" -m "CI release build ${BUILD_NUMBER}"
          git push origin --tags || true
        '''
      }
    }
    stage('Monitoring & Health Check') {
      steps {
        sh '''
          for i in 1 2 3 4 5; do
            sleep 3
            if curl -fsS http://localhost:3000/healthz ; then
              echo "App healthy"; exit 0
            fi
          done
          echo "Health check failed"; exit 1
        '''
        sh 'docker logs --tail=100 sit774-app || true'
      }
    }
  }
  post { always { cleanWs() } }
}
