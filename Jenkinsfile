void setBuildStatus(String credential_id, String context, String state, String message) {
    def gitCommit = sh(script: 'git rev-parse HEAD', returnStdout: true).trim()
    def data = """{"state":"${state}", "description":"${message}", "context":"${context}"}"""
    withCredentials([usernamePassword(credentialsId: credential_id, usernameVariable: 'USERNAME', passwordVariable: 'PASSWORD')]) {
        sh "curl -X POST --user $USERNAME:$PASSWORD --data '${data}' --url https://api.github.com/repos/UW-IUGA/iuga-web-client/statuses/$gitCommit"
    }
}

pipeline {
    agent any
    
    stages {
        stage('Checkout') {
            steps {
                setBuildStatus("github_classic", "iuga/jenkins/cicd", "pending", "Checking out repository...");
                checkout scmGit(branches: [[name: '*/main']], extensions: [], userRemoteConfigs: [[credentialsId: 'github_classic', url: 'https://github.com/UW-IUGA/iuga-web-client.git']])
            }
        }
        stage('Build') {
            steps {
                setBuildStatus("github_classic", "iuga/jenkins/cicd", "pending", "Building application...");
                sh 'docker build . -t "iuga/iuga-web-app"'
            }
        }
        stage('Push to Registry') {
            steps {
                withCredentials([usernamePassword(credentialsId: 'dockerhub', usernameVariable: 'USERNAME', passwordVariable: 'PASSWORD')]) {
                        sh 'docker login -u $USERNAME -p $PASSWORD'
                }
                sh 'docker push iuga/iuga-web-app'
            }
        }
        stage('Deploy') {
            steps {
                setBuildStatus("github_classic", "iuga/jenkins/cicd", "pending", "Deploying application...");
                sh 'docker pull iuga/iuga-web-app'
                sh 'docker rm -f iuga-web || true'
                sh 'docker run -d -p "127.0.0.1:7272:80" --name iuga-web iuga/iuga-web-app'
            }
        }
    }
    
    post {
        success {
            setBuildStatus("github_classic", "iuga/jenkins/cicd", "success", "Pipeline succeeded!");
        }
        failure {
            setBuildStatus("github_classic", "iuga/jenkins/cicd", "failure", "Pipeline failed.");
        }
    }
}
