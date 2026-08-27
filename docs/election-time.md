# Hora das votacións

A zona horaria de negocio do club é `Europe/Madrid`, presentada na interface
como «hora de Galicia». Os valores `datetime-local` interprétanse sempre nesa
zona, independentemente do navegador ou do servidor.

PostgreSQL garda os instantes absolutos en columnas `timestamp with time zone` e
a interface volve presentalos en hora de Galicia. As horas civís inexistentes ou
ambiguas durante os cambios de horario rexéitanse.
