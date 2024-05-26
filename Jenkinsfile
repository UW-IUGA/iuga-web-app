void setBuildStatus(String credential_id, String context, String state, String message) {
    def gitCommit = sh(script: 'git rev-parse HEAD', returnStdout: true).trim()
    def targetUrl = env.RUN_DISPLAY_URL
    def data = """{"state":"${state}", "target_url": "${targetUrl}", "description":"${message}", "context":"${context}"}"""
    withCredentials([usernamePassword(credentialsId: credential_id, usernameVariable: 'USERNAME', passwordVariable: 'PASSWORD')]) {
        sh "curl -X POST --user $USERNAME:$PASSWORD --data '${data}' --url https://api.github.com/repos/UW-IUGA/iuga-web-client/statuses/$gitCommit"
    }
}

pipeline {
    agent any
    
    environment {
        GITHUB_CREDENTIALS = credentials('github_classic')
        DOCKERHUB_CREDENTIALS = credentials('dockerhub')
        TEST_CRED = credentials('testCred')
        DOCKER_IMAGE = "iuga/iuga-web-app"
    }
    
    stages {
        stage('Checkout') {
            steps {
                script {
                    setBuildStatus(env.GITHUB_CREDENTIALS, "iuga/jenkins/cicd/dev", "pending", "Checking out repository...")
                }
                checkout scmGit(branches: [[name: '*/main']], extensions: [], userRemoteConfigs: [[credentialsId: env.GITHUB_CREDENTIALS, url: 'https://github.com/UW-IUGA/iuga-web-client.git']])
            }
        }
        stage('Build') {
            steps {
                script {
                    setBuildStatus(env.GITHUB_CREDENTIALS, "iuga/jenkins/cicd/dev", "pending", "Building application...")
                }
                sh 'docker build . -t "${DOCKER_IMAGE}"'
            }
        }
        stage('Push to Registry') {
            steps {
                script {
                    docker.withRegistry('https://index.docker.io/v1/', 'dockerhub') {
                        sh 'docker push ${DOCKER_IMAGE}'
                    }
                }
            }
        }
        stage('Deploy') {
            steps {
                script {
                    setBuildStatus(env.GITHUB_CREDENTIALS, "iuga/jenkins/cicd/dev", "pending", "Deploying application...")
                }
                sh 'docker pull ${DOCKER_IMAGE}'
                sh 'docker rm -f iuga-web || true'
                sh '''
                docker run -d -p "127.0.0.1:7777:7777" --name iuga-web \
                -v /var/lib/iuga-web-app:/app/public/uploads \
                -e TEST_ENV_VAR="${TEST_CRED}" \
                ${DOCKER_IMAGE}
                '''
            }
        }
    }
    
    post {
        success {
            script {
                setBuildStatus(env.GITHUB_CREDENTIALS, "iuga/jenkins/cicd/dev", "success", "Pipeline succeeded!")
            }
        }
        failure {
            script {
                setBuildStatus(env.GITHUB_CREDENTIALS, "iuga/jenkins/cicd/dev", "failure", "Pipeline failed.")
            }
        }
    }
}
