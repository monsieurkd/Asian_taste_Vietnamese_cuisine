# Asian Taste API — production container.
#
# Multi-stage: the SDK image builds, the smaller ASP.NET runtime image ships.
# The two stages are separate so the ~1 GB SDK never reaches production.
#
# Build context is the REPOSITORY ROOT, not src/AsianTaste.API — the project
# file references nothing outside itself today, but keeping the context at the
# root means a future shared project (or a Directory.Build.props) works without
# editing the deploy config. Use:  docker build -f src/AsianTaste.API/Dockerfile .

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy the csproj first and restore on its own. Docker caches this layer, so a
# change to source code does not re-download every NuGet package — the restore
# is the slow step and it only depends on the project file.
COPY src/AsianTaste.API/AsianTaste.API.csproj src/AsianTaste.API/
RUN dotnet restore src/AsianTaste.API/AsianTaste.API.csproj

# Now the source (which includes the embedded migration .sql files — they are
# EmbeddedResource, so they must be present before publish).
COPY src/AsianTaste.API/ src/AsianTaste.API/
RUN dotnet publish src/AsianTaste.API/AsianTaste.API.csproj \
        --configuration Release \
        --no-restore \
        --output /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

# The base image ships a non-root `app` user; using it means a compromised
# process cannot write to the application directory.
USER app
COPY --from=build --chown=app:app /app .

# Fly and most PaaS hosts inject the port to listen on. Program.cs reads
# ASPNETCORE_URLS, so the container must honour that variable rather than
# hardcoding 5070 — otherwise the health check can never reach the app.
# 8080 is only the fallback for a plain `docker run`.
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

# ASPNETCORE_ENVIRONMENT is deliberately NOT set here. It must be set per
# environment (Fly secrets), because Development would enable the
# unauthenticated /api/dev/db/* endpoints in production.
ENTRYPOINT ["dotnet", "AsianTaste.API.dll"]
