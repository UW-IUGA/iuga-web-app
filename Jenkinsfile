pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                checkout scmGit(branches: [[name: '*/main']], extensions: [], userRemoteConfigs: [[credentialsId: 'github_classic', url: 'https://github.com/UW-IUGA/iuga-web-client.git']])
            }
        }
        stage('Build') {
            steps {
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
                sh 'docker pull iuga/iuga-web-app'
                sh 'docker rm -f iuga-web || true'
                sh 'docker run -d -p "127.0.0.1:7272:80" --name iuga-web iuga/iuga-web-app'
            }
        }
    }
}