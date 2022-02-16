.PHONY: gen-proto
gen-proto:
	protoc --go_out=./gen/ --go_opt=paths=source_relative \
		--go-grpc_out=./gen/ --go-grpc_opt=paths=source_relative \
		./proto/*.proto

.PHONY: build
build:
	GOOS=linux GOARCH=amd64 go build -o ./build/bin-linux ./server

.PHONY: deploy
deploy:
	ansible-playbook ./ansible/deploy.yml -i grpcServer,
