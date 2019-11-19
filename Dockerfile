FROM node:alpine

ADD . /code
WORKDIR /code

ENTRYPOINT ["sh", "-c"]
CMD ["yarn && yarn start"]