# Cabeceiras HTTP e migracións

Todas as rutas envían unha CSP mínima con `frame-ancestors 'none'`,
`base-uri 'self'` e `form-action 'self'`. A aplicación tamén envía
`X-Frame-Options: DENY` como defensa anti-framing para clientes antigos e
`X-Content-Type-Options: nosniff`. As rutas públicas de voto conservan ademais
as súas restricións de referer, caché e indexación.

HSTS non se configura desde a aplicación para non aplicalo en contornas locais.
Debe verificarse e configurarse no dominio HTTPS de produción ou no provedor que
remate TLS.

Os ficheiros SQL e metadatos de Drizzle están fixados a LF mediante
`.gitattributes`. Así, o SQL conserva os mesmos bytes entre plataformas e os
hashes das migracións son reproducibles.
