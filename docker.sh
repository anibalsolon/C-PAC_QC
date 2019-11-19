#!/bin/bash

docker build -t fcpindi/c-pac_qc .
docker run -it -p 1200:1200 -v `pwd`:/code fcpindi/c-pac_qc