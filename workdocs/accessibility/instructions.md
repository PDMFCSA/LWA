### serve pages locally

docker run -itd --name static-file-host --hostname test-site -v "$(pwd)"/workdocs/accessibility:/usr/share/nginx/html -p 8080:80 nginx:1.25-alpine