# Transporte do token de voto

As ligazóns públicas usan o formato /v#fragmento. O fragmento non se envía na
petición GET: `/v` é sempre o punto de bootstrap, o navegador elimina o
fragmento inmediatamente do enderezo e transmíteo unha única vez no corpo do
POST same-origin de intercambio. A resposta crea un identificador de sesión
aleatorio e unha cookie de voto HttpOnly firmada, restrinxida ao path
`/v/papeleta/<sessionId>`. O navegador substitúe a localización por ese path.
Esta ruta renderízase no servidor e as súas recargas e Server Actions só aceptan
a credencial da cookie cuxo payload coincide co `sessionId` da propia ruta.

As cookies de sesións diferentes poden coexistir porque cada unha ten un path
distinto. O `sessionId` non é unha credencial: sen a cookie firmada específica
non permite consultar nin emitir un voto.

O endpoint non rexistra o corpo, o token nin o seu hash. A infraestrutura diante
da aplicación (proxy, CDN, WAF, observabilidade e APM) tamén debe ter desactivada
a captura dos corpos de petición para /api/voting/session, incluídos mostras,
trazas de erro e replays. Os rexistros poden conservar método, ruta fixa, estado
e tempos, pero non o corpo nin a cabeceira Cookie.

A sesión non substitúe as comprobacións electorais: cada voto volve bloquear e
validar a elección, a credencial, a persoa votante e as candidaturas. A cookie
mantense tras un voto correcto para que unha recarga poida mostrar o estado USED;
non contén o token nin datos da papeleta.
