import { AppStage } from './app-stage';
import { LambdaInvokeStep } from './stage-action/lambda-invoke-step';
import * as Lambda from 'aws-cdk-lib/aws-lambda';
import { CodePipeline } from 'aws-cdk-lib/pipelines';
import { PipelineStack } from './pipeline-stack';
import { StageType } from './constants/stages';
import { AwsRegion } from './types';
import { Code, LayerVersion, Runtime } from 'aws-cdk-lib/aws-lambda';
import { TestImageResizer } from './integration-test/test-image-resizer';

/**
 * Create layer for lambda function that exposes winston logger
 * @param app Pipeline app
 * @returns Lambda Layer with logger.
 */
const createLoggerLayer = (app: PipelineStack, region: AwsRegion): LayerVersion => {
  return new LayerVersion(app, `WinstonLayer-${region}`, {
    compatibleRuntimes: [Runtime.NODEJS_12_X, Runtime.NODEJS_14_X],
    code: Code.fromAsset('lib/integration-test/layers'),
  });
};

/**
 * Creates the Lambda for the LambdaInvokeAction.
 * This Lambda will execute integration tests for the
 * Thumbnail generation service
 *
 * @returns Lambda used for running integration tests in the pipeline
 */
const createIntegrationTestLambda = (
  app: PipelineStack,
  appRegion: AwsRegion,
  stageName: StageType,
  testLambdaName: string
): Lambda.Function => {
  const testerLambda = new TestImageResizer(
    app,
    `test-image-resizer-${stageName}`,
    testLambdaName,
    stageName,
    appRegion
  );
  testerLambda.lambdaFunction.addLayers(createLoggerLayer(app, appRegion));

  return testerLambda.lambdaFunction;
};

/**
 * Adds the stage and each of the stages stacks (in case of Wave deployment)
 * to the CodePipeline pipeline. If stage is a pre-prod stage,
 * it adds a Lambda invoke step that will run the integration tests.
 *
 * @param app - Pipeline CDK Stack
 * @param pipeline - CodePipeline pipeline
 * @param stageName - Name of the stage to be created
 * @param accountId - account where the stage will be deployed
 * @param region - Region where stage is deployed
 */
export const addStageToPipeline = (
  app: PipelineStack,
  pipeline: CodePipeline,
  stageName: string,
  accountId: string,
  region: AwsRegion
): void => {
  const appStage = new AppStage(app, stageName, {
    env: {
      account: accountId,
      region: region,
    },
  });

  const stage = pipeline.addStage(appStage);
  if (stageName === StageType.BETA || stageName === StageType.ALPHA) {
    // Add lambda invokation step to pre-prod stages.
    const testerLambda = createIntegrationTestLambda(
      app,
      region,
      stageName,
      appStage.testLambdaName
    );
    stage.addPost(new LambdaInvokeStep(testerLambda));
  }
};
