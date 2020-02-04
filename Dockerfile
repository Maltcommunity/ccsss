FROM node:latest

RUN \
  wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - && \
  echo "deb http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google.list && \
  apt-get update && \
  apt-get install -y google-chrome-stable && \
  rm -rf /var/lib/apt/lists/*

RUN git clone https://github.com/Maltcommunity/ccsss.git /opt/ccsss

WORKDIR /opt/ccsss

RUN npm install --production

EXPOSE 8888

CMD ["/opt/ccsss/bin/ccsss"]
