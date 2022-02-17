# A demo for gRPC Infra as Code on AWS

## Descr

Build gRPC Infrastructure by Pulumi as a IoC demo. Use Pulumi for Building LB, EC2, etc.

Use Ansible for building EC2 AMI that required in stack. However, once you build an AMI (or use that
I have already provided in pulumi/Pulumi.dev.yaml), you will not need Ansible again.

## How To Use

1. Build an AMI

   You could use the AMI I provided to skip this step.

   This step require Go and Ansible environment.

   1. Create An EC2, select Amazon Linux 2 AMI, set up the ssh hosts file for Ansible.
   2. Under the project root, run `make build` to build the binary, and run `make deploy` to deploy the binary.
   3. Build AMI from the EC2 instance, and replace the `stack:ami` field in `pulumi/Pulumi.dev.yaml`.

2. Get your domain and certificate
   
   1. Get your domain from anywhere, and transfer it to Route 53.
   2. Get your certification of the domain on ACM.
   3. Paste your domain zone to replace `aws:recordzone` field, and your certification domain to replace `aws:certdomain` field in `pulumi/Pulumi.dev.yaml`.

3. Build the infrastructure
   
   Just run `pulumi up` under `./pulumi`.

4. Test the gRPC connection
   
   Run `go run ./client --addr=<yourRecordName>.<yourDomainName>:50051`, and you will recieve the response.
