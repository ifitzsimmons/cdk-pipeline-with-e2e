import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { AwsRegion } from '../types';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Duration } from 'aws-cdk-lib';

export class TestImageResizer extends Construct {
  public lambdaFunction: NodejsFunction;

  // eslint-disable-next-line require-jsdoc
  constructor(
    scope: Construct,
    id: string,
    testLambdaName: string,
    stageName: string,
    appRegion: AwsRegion
  ) {
    super(scope, id);

    this.lambdaFunction = new NodejsFunction(this, 'function', {
      functionName: `IntegrationTest-${stageName}-${appRegion}-v2`,
      runtime: Runtime.NODEJS_14_X,
      timeout: Duration.minutes(2),
      bundling: {
        target: 'es2020',
      },
      environment: {
        CREATE_THUMBNAIL_DRIVER_NAME: testLambdaName,
        THUMBNAIL_GENERATOR_REGION: appRegion,
      },
    });

    this.lambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'InvokeServiceTester',
        effect: iam.Effect.ALLOW,
        actions: ['lambda:InvokeFunction'],
        resources: ['*'],
      })
    );
  }
}
