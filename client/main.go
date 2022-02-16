package main

import (
	"context"
	"flag"
	"io"
	"log"
	"time"

	gen "github.com/RyoJerryYu/grpc-server-demo/gen/proto"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

const (
	defaultName = "world"
)

var (
	addr = flag.String("addr", "localhost:50051", "the address to connect to")
	name = flag.String("name", defaultName, "Name to greet")
)

func callBiStream(stream gen.HelloService_StreamHelloClient) {
	waitc := make(chan struct{})
	go func() {
		for {
			in, err := stream.Recv()
			switch err {
			case nil:
			case io.EOF:
				close(waitc)
				return
			default:
				log.Fatalf("receive error: %v", err)
			}

			log.Printf("Stream Recieved: %v", in.GetMessage())
		}
	}()
	for _, s := range []string{"a", "b", "c", "d"} {
		if err := stream.Send(&gen.HelloRequest{Name: s}); err != nil {
			log.Fatalf("could not send: %v", err)
		}
	}
	stream.CloseSend()
	<-waitc
}

func main() {
	flag.Parse()
	conn, err := grpc.Dial(*addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("did not connect: %v", err)
	}
	defer conn.Close()

	c := gen.NewHelloServiceClient(conn)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	r, err := c.SayHello(ctx, &gen.HelloRequest{Name: *name})
	if err != nil {
		log.Fatalf("could not greet: %v", err)
	}
	log.Printf("Greeting: %s", r.Message)

	stream, err := c.StreamHello(ctx)
	if err != nil {
		log.Fatalf("could not get stream: %v", err)
	}
	callBiStream(stream)
}
