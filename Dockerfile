FROM node:latest

ENV DISPLAY=:1.0

RUN apt-get update \
    && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libx11-xcb-dev libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

COPY . /opt/ccsss

RUN chown node:node /opt/ccsss/ -R

USER node

WORKDIR /opt/ccsss

RUN npm install --production

EXPOSE 8888

CMD ["/opt/ccsss/bin/ccsss"]
