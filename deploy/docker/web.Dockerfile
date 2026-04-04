# survey-service — Angular static assets behind nginx (scaffold)
FROM nginx:1.25-alpine
RUN printf '%s\n' \
  '<!DOCTYPE html>' \
  '<html lang="en"><head><meta charset="utf-8"><title>Survey Service</title></head>' \
  '<body><h1>Survey Service — web scaffold</h1><p>Replace with <code>ng build</code> output.</p></body></html>' \
  > /usr/share/nginx/html/index.html
